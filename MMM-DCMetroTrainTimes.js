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
/*global Module Log */

const colorValues = {
    BL: "DeepSkyBlue",
    GR: "Green",
    OR: "Orange",
    RD: "Red",
    SV: "Snow",
    YL: "Yellow"
};



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
        showDestinationFullName: true, // show full train destination names
        aggregateDestinations: [ ] // Aggregation of destinations
    },
    // the start function
    start: function() {
        // log starting
        Log.info("Starting module: " + this.name);
        this.config.identifier = this.identifier;
        this.config.path = this.data.path;
        this.errorMessage = null;
        this.dataIncidentDescriptionList = null;
        this.dataIncidentLinesList = null;
        this.trainData = null;

        // Maps bus stop IDs to corresponding payload info from the node helper.
        this.dataBusList = {};
        this.aggregateBusList = null;
        this.lastUpdated = null;

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
        setInterval(function() { self.updateDom(); }, 2000);
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
            this.lastUpdated = payload.time;
            this.updateDom();
            break;

        case "DCMETRO_STATIONTRAINTIMES_UPDATE":
            this.trainData = payload;
            this.lastUpdated = payload.time;
            this.updateDom();
            break;

        case "DCMETRO_BUSTIMES_UPDATE":
            this.dataBusList[payload.stopID] = payload;
            this.lastUpdated = payload.time;
            this.groupBuses();
            this.updateDom();
            break;

        case "DCMETRO_TOO_MANY_ERRORS":
            this.errorMessage = "Error: Too Many REST Failures";
            this.lastUpdated = null;
            this.updateDom();
            break;

        case "DCMETRO_RESOLVED_ERRORS":
            this.errorMessage = null;
            this.lastUpdated = null;
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
        this.addDomForUpdateTime(wrapper);
        return wrapper;
    },

    getDomForErrors: function() {
        // if error has occured indicate so and return
        var wrapper;
        if (this.errorMessage !== null) {
            wrapper = document.createElement("div");
            wrapper.className = "small";
            wrapper.innerHTML = this.errorMessage;
            return wrapper;
        }
        // if no data has been loaded yet indicate so and return
        if (!this.lastUpdated) {
            wrapper = document.createElement("div");
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
        var lineIndex, lineCode;

        // create the header row titled "incidents"
        var headRow = document.createElement("tr");
        var headElement = document.createElement("td");
        var iRow, iElement;
        headElement.className = "small header";
        headElement.colSpan = "3";
        headElement.innerHTML = "Incidents";
        headRow.appendChild(headElement);
        wrapper.appendChild(headRow);
        // if there are lines with incidents on them list them
        if (this.dataIncidentLinesList.length > 0) {
            iRow = document.createElement("tr");
            iElement = document.createElement("td");
            var incidentCount = this.dataIncidentLinesList.length;
            iElement.width = this.config.limitWidth;
            iElement.className = "xsmall";
            iElement.colSpan = "3";
            var incidentHTML;
            if (this.config.incidentCodesOnly) {
                iElement.align = "center";
                incidentHTML = "";
                for (lineIndex = 0; lineIndex < incidentCount; lineIndex++){
                    lineCode = this.dataIncidentLinesList[lineIndex];
                    if (this.config.colorizeLines) {
                        incidentHTML += "<div style='display:inline;color:" +
                        this.getLineCodeColor(lineCode) + "'>";
                    } else {
                        incidentHTML += "<div style='display:inline;'>";
                    }
                    incidentHTML += lineCode + "</div>";
                    if (lineIndex < incidentCount - 1) {
                        incidentHTML += "&nbsp;&nbsp;";
                    }
                }
                iElement.innerHTML = incidentHTML;
            } else {
                // create a string and add each incident line's color to the
                // string
                iElement.align = "left";
                incidentHTML = "";
                if (this.dataIncidentLinesList.length === 1) {
                    incidentHTML += "Incident Reported On ";
                } else {
                    incidentHTML += "Incidents Reported On ";
                }
                for (lineIndex = 0; lineIndex < incidentCount; lineIndex++){
                    lineCode = this.dataIncidentLinesList[lineIndex];
                    if ((lineIndex === incidentCount - 1)
                        && (this.dataIncidentLinesList.length > 1)) {
                        incidentHTML += "and ";
                    }
                    if (this.config.colorizeLines) {
                        incidentHTML += "<div style='display:inline;color:"
                        + this.getLineCodeColor(lineCode)
                        + "'>";
                    } else {
                        incidentHTML += "<div style='display:inline;'>";
                    }
                    incidentHTML += this.getLineCodeName(lineCode) + "</div>";
                    if ((lineIndex !== incidentCount - 1)
                        && (incidentCount > 2)) {incidentHTML += ",";}
                    incidentHTML += " ";
                }
                // add the right post-fix based on count
                if (this.dataIncidentLinesList.length === 1) {
                    incidentHTML += "Line";
                } else {
                    incidentHTML += "Lines";
                }
                iElement.innerHTML += incidentHTML;
            }

            iRow.appendChild(iElement);
            wrapper.appendChild(iRow);
        } else {
            // if no lines with incidents then say so
            iRow = document.createElement("tr");
            iElement = document.createElement("td");
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
        if (this.trainData === null) return;

        // iterate through each station in config station list
        for (var i = 0; i < this.config.stationsToShowList.length; i++) {
            this.addDomForTrainStation(wrapper,
                this.config.stationsToShowList[i]);
        }
    },

    addDomForTrainStation: function(wrapper, stationCode) {
        var cStation = this.trainData.data[stationCode];
        if (cStation === undefined) return;
        var trains = cStation.TrainList;

        // create a header row of the station name
        var trainRow;
        var headRow = document.createElement("tr");
        headRow.innerHTML = "<td colspan='3' class='small header'>" +
            cStation.StationName + "</td>";
        wrapper.appendChild(headRow);

        if (trains.length == 0) trains = [ [ "--", "No Trains", "" ] ];

        var maxTrains = this.config.maxTrainTimesPerStation;
        if (maxTrains !== 0 && maxTrains < trains.length) {
            trains = trains.slice(0, maxTrains);
        }

        trains.forEach((cTrain) => {
            trainRow = document.createElement("tr");
            trainRow.className = "xsmall";
            trainRow.align = "left";
            trainRow.innerHTML = "<td" +
                (this.config.colorizeLines ?
                    " style='color:" + this.getLineCodeColor(cTrain.Line) + "'"
                    : "") +
                ">" + cTrain.Line + "</td>" +
                "<td align='left'>" + cTrain.Destination + "</td>" +
                "<td align='right'>" +
                this.diffTimes(cTrain.Min, this.trainData.time) +
                "</td>";
            wrapper.appendChild(trainRow);
        });
    },

    /*
     * Aggregates buses by stop name, constructing this.aggregateBusList. The
     * resulting instance variable maps bus stop names to a list of busTimes
     * objects.
     */
    groupBuses: function() {
        this.aggregateBusList = new Map();
        var abl = this.aggregateBusList;
        var stationIDs = Object.keys(this.dataBusList);
        var maxTrains = this.config.maxTrainTimesPerStation;
        if (stationIDs.length == 0) { return; }

        stationIDs.forEach((stationID) => {
            var payload = this.dataBusList[stationID];
            var buses = payload.busTimes;
            if (maxTrains !== 0 && maxTrains < buses.length) {
                buses = buses.slice(0, maxTrains);
            }
            if (!abl.has(payload.stopName)) {
                abl.set(payload.stopName, new Array());
            }
            abl.get(payload.stopName).push(...buses);
        });
    },

    addDomForBuses: function(wrapper) {

        var abl = this.aggregateBusList;
        if (!abl || abl.size == 0) { return; }
        var maxTrains = this.config.maxTrainTimesPerStation;

        abl.forEach((buses, station, map) => {
            var row = document.createElement("tr");
            row.innerHTML = "<td colspan='3' class='small header'>" +
                    station + "</td>";
            wrapper.appendChild(row);
            if (maxTrains !== 0 && maxTrains < buses.length) {
                buses = buses.slice(0, maxTrains);
            }
            buses.forEach((bus) => {
                row = document.createElement("tr");
                row.innerHTML = "<td class='xsmall' align='left'>" +
                        bus.routeID + "</td>" +
                        "<td class='xsmall' align='left'>" +
                        bus.directionText + "</td>" +
                        "<td class='xsmall' align='right'>" +
                        bus.minutes + "</td>";
                wrapper.appendChild(row);
            });
        });
    },

    addDomForUpdateTime: function(wrapper) {
        // create the header row titled "incidents"
        var row = document.createElement("tr");
        var elt = document.createElement("td");
        elt.className = "dimmed light xsmall";
        elt.colSpan = "3";
        elt.innerHTML = "Updated " + this.getDelayTime();
        row.appendChild(elt);
        wrapper.appendChild(row);
        return wrapper;
    },

    getStyles: function() {
        return [ "metrotimes.css" ];
    },


    /*
     * Returns the time since the last update.
     */
    getDelayTime: function() {
        if (this.lastUpdated === null) { return "time null"; }
        var then = Date.parse(this.lastUpdated);
        if (isNaN(then)) { return "time unknown"; }
        var delay = Date.now() - then;
        if (delay < 2000) { return "just recently"; }
        if (delay < 60000) { return Math.round(delay / 1000) + " seconds ago"; }
        delay /= 60000;
        if (delay < 1.5) { return "1 minute ago"; }
        if (delay < 60) { return Math.round(delay) + " minutes ago"; }
        delay /= 60;
        if (delay < 1.5) { return "1 hour ago"; }
        return null;

        // Anything beyond this is too much
        if (delay < 24) { return Math.round(delay) + " hours ago"; }
        delay /= 24;
        if (delay < 1.5) { return "1 day ago"; }
        return Math.round(delay) + " days ago";
    },

    /*
     * Takes a comma-separated list of arrival times and a time of last update,
     * and revises the list per this.diffTime().
     */
    diffTimes: function(values, updateTime) {
        if (values === undefined) return "";
        return values.split(', ').map((val) => {
            return this.diffTime(val, updateTime);
        }).join(", ");
    },

    /*
     * Takes an arrival time and a time of last update, and revises the arrival
     * time to account for delay since the last update.
     */
    diffTime: function(value, updateTime) {
        if (updateTime === null) { return value + "?"; }
        var then = Date.parse(updateTime);
        if (isNaN(then)) { return value + "?"; }

        var delay = Math.floor((Date.now() - then) / 60000);
        if (delay == 0) { return value; }

        var val = parseInt(value);
        if (isNaN(val)) { return value + "-" + delay };
        if (val < delay) { return "past" };
        return '' + (val - delay);
    },

});

// ------------ END -------------
