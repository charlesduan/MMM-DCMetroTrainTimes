/* MMM-DCMetroTrainTimes.js
 *
 * Magic Mirror
 * Module: MMM-DCMetroTrainTimes
 *
 * Magic Mirror By Michael Teeuw http://michaelteeuw.nl
 * MIT Licensed.
 *
 * Module MMM-DCMetroTrainTimes By Adam Moses http://adammoses.com
 */
// main module setup stuff
Module.register("MMM-DCMetroTrainTimes", {
    // setup the default config options
    defaults: {
        // required
        wmata_api_key: null, // this must be set
        // optional
        showIncidents: true, // show incidents by default
        showStationTrainTimes: true, // show train times by default
        busStopsToShowList: [ ],
        stationsToShowList: [ "A01", "C01" ], // both metro centers default
        destinationsToExcludeList: [ ], // exclude nothing default
        refreshRateIncidents: 2 * 60 * 1000, // two minute default
        refreshRateStationTrainTimes: 30 * 1000, // thirty second default
        maxTrainTimesPerStation: 0, // default shows all train times
        showHeader: true, // show the header by default
        headerText: "DC Metro Train Times", // default header text
        limitWidth: "200px", // limits the incident list (widest cell) width
        colorizeLines: false, // default to no color
        incidentCodesOnly: false, // default to full text incident line listing
        hideTrainTimesLessThan: 0, // default to show all train times
        showDestinationFullName: true, // default to show full train destination names
    },
    // the start function
    start: function() {
        // log starting
        Log.info("Starting module: " + this.name);
        this.config.identifier = this.identifier;
        this.config.path = this.data.path;
        this.firstUpdateDOMFlag = false;
        this.dataLoaded = false;
        this.errorMessage = null;
        this.dataIncidentDescriptionList = null;
        this.dataIncidentLinesList = null;
        this.dataStationTrainTimesList = null;
        this.dataBusList = {};

        // if set to show the header, set it
        if (this.config.showHeader) {
            this.data.header = this.config.headerText;
        }

        // the api key is set, send the config
        if (this.config.wmata_api_key !== null) {
            this.sendSocketNotification("REGISTER_CONFIG", this.config);
        // if not, flag the error
        } else {
            this.errorMessage = "Error: Missing API Key";
        }

        // schedule the first dom update
        var self = this;
        setTimeout(function() { self.firstUpdateDOM(); }, 2000);
    },
    // delayed call for first DOM update
    firstUpdateDOM: function() {
        this.firstUpdateDOMFlag = true;
        this.updateDom();
    },
    // the socket handler
    socketNotificationReceived: function(notification, payload) {

        if (payload.identifier !== this.identifier) {
            return;
        }

        switch (notification) {
        case "DCMETRO_INCIDENT_UPDATE":
            this.dataIncidentDescriptionList = payload.descriptionList;
            this.dataIncidentLinesList = payload.linesList;
            this.dataLoaded = true;
            if (this.firstUpdateDOMFlag) this.updateDom();
            break;

        case "DCMETRO_STATIONTRAINTIMES_UPDATE":
            this.dataStationTrainTimesList = payload.stationTrainList;
            this.dataLoaded = true;
            if (this.firstUpdateDOMFlag) this.updateDom();
            break;

        case "DCMETRO_BUSTIMES_UPDATE":
            this.dataBusList[payload.stopName] = payload.busTimes;
            this.dataLoaded = true;
            if (this.firstUpdateDOMFlag) { this.updateDom(); }
            break;

        case "DCMETRO_TOO_MANY_ERRORS":
            this.errorMessage = "Error: Too Many REST Failures";
            this.updateDom();
            break;

        case "DCMETRO_RESOLVED_ERRORS":
            this.errorMessage = null;
            this.dataLoaded = false;
            this.updateDom();
            break;
        }
    },

    // gets a fulltext name based on a color code
    getLineCodeName: function(theColorCode) {
        var colorNames = { BL: "Blue",
            GR: "Green",
            OR: "Orange",
            RD: "Red",
            SV: "Silver",
            YL: "Yellow"
        };
        return colorNames[theColorCode];
    },
    // gets an HTML color code based on a station color name or code
    getLineCodeColor: function(theColorCode) {
        var colorValues = { BL: "DeepSkyBlue",
            GR: "Green",
            OR: "Orange",
            RD: "Red",
            SV: "Snow",
            YL: "Yellow"
        };
        return colorValues[theColorCode];
    },
    // the get dom handler
    getDom: function() {
        var wrapper;
        wrapper = this.getDomForErrors();
        if (wrapper !== null) { return wrapper; }

        wrapper = document.createElement("table");
        this.addDomForIncidents(wrapper);
        this.addDomForTrains(wrapper);
        this.addDomForBuses(wrapper);
        return wrapper;
    },

    getDomForErrors: function() {
        // if error has occured indicate so and return
        if (this.errorMessage !== null)
        {
            var wrapper = document.createElement("div");
            wrapper.className = "small";
            wrapper.innerHTML = this.errorMessage;
            return wrapper;
        }
        // if no data has been loaded yet indicate so and return
        if (!this.dataLoaded)
        {
            var wrapper = document.createElement("div");
            wrapper.className = "small";
            wrapper.innerHTML = "Waiting For Update...";
            return wrapper;
        }
        // if no error or no lack of data proceed with main HTML generation
        return null;
    },

    addDomForIncidents: function(wrapper) {

        if (!this.config.showIncidents) return;
        if (this.dataIncidentLinesList === null) return;

        // create the header row titled "incidents"
        var headRow = document.createElement("tr");
        var headElement = document.createElement("td");
        headElement.className = "small";
        headElement.colSpan = "3";
        headElement.innerHTML = "Incidents";
        headRow.appendChild(headElement);
        wrapper.appendChild(headRow);
        // if there are lines with incidents on them list them
        if (this.dataIncidentLinesList.length > 0) {
            var iRow = document.createElement("tr");
            var iElement = document.createElement("td");
            var incidentCount = this.dataIncidentLinesList.length;
            iElement.width = this.config.limitWidth;
            iElement.className = "xsmall";
            iElement.colSpan = "3";
            var incidentHTML;
            if (this.config.incidentCodesOnly) {
                iElement.align = "center";
                incidentHTML = "";
                for (var lineIndex = 0; lineIndex < incidentCount; lineIndex++){
                    var lineCode = this.dataIncidentLinesList[lineIndex];
                    if (this.config.colorizeLines) {
                        incidentHTML += "<div style='display:inline;color:" +
                        this.getLineCodeColor(lineCode) + "'>";
                    } else {
                        incidentHTML += "<div style='display:inline;'>";
                    }
                    incidentHTML += lineCode + "</div>";
                    if (lineIndex < incidentCount - 1)
                        incidentHTML += "&nbsp;&nbsp;";
                }
                iElement.innerHTML = incidentHTML;
            } else {
                // create a string and add each incident line's color to the string
                iElement.align = "left";
                incidentHTML = "";
                if (this.dataIncidentLinesList.length === 1)
                    incidentHTML += "Incident Reported On ";
                else
                    incidentHTML += "Incidents Reported On ";
                for (var lineIndex = 0; lineIndex < incidentCount; lineIndex++){
                    var lineCode = this.dataIncidentLinesList[lineIndex];
                    if ((lineIndex === incidentCount - 1)
                        && (this.dataIncidentLinesList.length > 1))
                        incidentHTML += "and ";
                    if (this.config.colorizeLines)
                        incidentHTML += "<div style='display:inline;color:"
                        + this.getLineCodeColor(lineCode)
                        + "'>";
                    else
                        incidentHTML += "<div style='display:inline;'>";
                    incidentHTML += this.getLineCodeName(lineCode) + "</div>";
                    if ((lineIndex !== incidentCount - 1)
                        && (incidentCount > 2))
                        incidentHTML += ",";
                    incidentHTML += " ";
                }
                // add the right post-fix based on count
                if (this.dataIncidentLinesList.length === 1)
                    incidentHTML += "Line";
                else
                    incidentHTML += "Lines";
                iElement.innerHTML += incidentHTML;
            }

            iRow.appendChild(iElement);
            wrapper.appendChild(iRow);
        } else {
            // if no lines with incidents then say so
            var iRow = document.createElement("tr");
            var iElement = document.createElement("td");
            iElement.align = "left";
            iElement.colSpan = "3";
            iElement.className = "xsmall";
            iElement.innerHTML += "No Incidents Reported";
            iRow.appendChild(iElement);
            wrapper.appendChild(iRow);
        }
    },

    addDomForTrains: function(wrapper) {
        if (!this.config.showStationTrainTimes) return;
        if (this.dataStationTrainTimesList === null) return;

        // iterate through each station in config station list
        for (var i = 0; i < this.config.stationsToShowList.length; i++) {
            this.addDomForTrainStation(wrapper,
                    this.config.stationsToShowList[i]);
        }
    },

    addDomForTrainStation: function(wrapper, stationCode) {
        var cStation = this.dataStationTrainTimesList[stationCode];
        if (cStation === undefined) return;

        // create a header row of the station name
        var headRow = document.createElement("tr");
        var headElement = document.createElement("td");
        headElement.align = "right";
        headElement.colSpan = "3";
        headElement.className = "small";
        headElement.innerHTML = cStation.StationName;
        headRow.appendChild(headElement);
        wrapper.appendChild(headRow);

        if (cStation.TrainList.length == 0) {
            var trainRow = document.createElement("tr");
            trainRow.className = "xsmall";
            trainRow.align = "left";
            var lineElement = document.createElement("td");
            lineElement.innerHTML = "--";
            var destElement = document.createElement("td");
            destElement.align = "left";
            destElement.innerHTML = "No Trains";
            var minElement = document.createElement("td");
            minElement.align = "right";
            minElement.innerHTML = "";
            trainRow.appendChild(lineElement);
            trainRow.appendChild(destElement);
            trainRow.appendChild(minElement);
            wrapper.appendChild(trainRow);
            return;
        }

        // cap the number of train times to show if config-ed to do so
        var countTrainTimesToShow = cStation.TrainList.length;
        if ((this.config.maxTrainTimesPerStation !== 0)
            && (countTrainTimesToShow > this.config.maxTrainTimesPerStation))
            countTrainTimesToShow = this.config.maxTrainTimesPerStation;
        // iterate through the train times list
        for (var cTrainIndex = 0; cTrainIndex < countTrainTimesToShow; cTrainIndex++)
        {
            // each row should be the train line color, it's destination, and arrival time
            var cTrain = cStation.TrainList[cTrainIndex];
            var trainRow = document.createElement("tr");
            trainRow.className = "xsmall";
            trainRow.align = "left";
            var lineElement = document.createElement("td");
            if (this.config.colorizeLines)
                lineElement.style = "color:" + this.getLineCodeColor(cTrain.Line);
            lineElement.innerHTML = cTrain.Line;
            var destElement = document.createElement("td");
            destElement.align = "left";
            destElement.innerHTML = cTrain.Destination;
            var minElement = document.createElement("td");
            minElement.align = "right";
            minElement.innerHTML = cTrain.Min;
            trainRow.appendChild(lineElement);
            trainRow.appendChild(destElement);
            trainRow.appendChild(minElement);
            wrapper.appendChild(trainRow);
        }
    },

    addDomForBuses: function(wrapper) {
        var stations = Object.keys(this.dataBusList);
        if (stations.length == 0) { return; }

        for (var i = 0; i < stations.length; i++) {
            var row = document.createElement("tr");
            row.innerHTML = "<td colspan='3' class='small' align='right'>" +
                    stations[i] + "</td>";
            wrapper.appendChild(row);

            var buses = this.dataBusList[stations[i]];
            for (var j = 0; j < buses.length; j++) {
                row = document.createElement("tr");
                row.innerHTML = "<td class='xsmall' align='left'>" +
                        buses[j].routeID + "</td>" +
                        "<td class='xsmall' align='left'>" +
                        buses[j].directionText + "</td>" +
                        "<td class='xsmall' align='right'>" +
                        buses[j].minutes + "</td>";
                wrapper.appendChild(row);
            }
        }
    },

});

// ------------ END -------------
