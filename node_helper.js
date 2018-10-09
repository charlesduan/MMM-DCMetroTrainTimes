/* node_helper.js
 *
 * Magic Mirror
 * Module: MMM-DCMetroTrainTimes
 *
 * Magic Mirror By Michael Teeuw http://michaelteeuw.nl
 * MIT Licensed.
 *
 * Module MMM-DCMetroTrainTimes By Adam Moses http://adammoses.com
 */

// call in the required classes
var NodeHelper = require("node_helper");
const https = require("https");
const querystring = require("querystring");
const fs = require("fs");
const errorFailLimit = 5;
// the main module helper create
module.exports = NodeHelper.create({
    // subclass start method, clears the initial config array
    start: function() {
        this.stationInformationList = null;
        this.errorCount = 0;
        this.stopUpdates = false;
    },
    // subclass socketNotificationReceived, received notification from module
    socketNotificationReceived: function(notification, theConfig) {
        this.theConfig = theConfig;
        if (notification === "REGISTER_CONFIG") {
        // create self reference for interval calls
            var self = this;
            // load in the station information list
            this.loadStationInformationList(theConfig.path);

            // if config-ed to show incidients, start that up
            if (theConfig.showIncidents) {
                this.updateIncidents(theConfig);
                setInterval(function() { self.updateIncidents(theConfig); },
                    theConfig.refreshRateIncidents);
            }

            // if config-ed to show station train times, start that up
            if (theConfig.showStationTrainTimes) {
                // delay the first train times check to not collide with first
                // incident update
                setTimeout(function() { self.updateArrivalTimes(theConfig); },
                    1000);
                setInterval(function() { self.updateArrivalTimes(theConfig); },
                    theConfig.refreshRateStationTrainTimes);
            }

            return;
        }
    },
    // increment error count, if passed limit send notice to module
    processError: function(e) {
        this.errorCount += 1;
        var self = this;
        if (this.errorCount >= errorFailLimit)
        {
            this.sendSocketNotification("DCMETRO_TOO_MANY_ERRORS", {} );
            this.stopUpdates = true;

            // Create a timer to clear the error so we can restart processing
            setTimeout(function() {
                self.errorCount = 0;
                self.stopUpdates = false;
                self.sendSocketNotification("DCMETRO_RESOLVED_ERRORS", {});
            }, 5 * 60 * 1000);
        }
    },
    // --- STATION INFORMATION STUFF ---
    // loads the station information list from file
    loadStationInformationList: function(path) {
        // station list is loaded from file as it is rarely updated
        // to force update this please run ./stationcodes/getStationCodes.js
        // if it's already been loaded then skip this
        if (this.stationInformationList === null) {
            var fileData = fs.readFileSync(path + "/stationcodes/stationcodes.json");
            this.stationInformationList = JSON.parse(fileData);
        }
    },
    // get the station name for a given station code
    getStationName: function(theStationCode) {
        // iterate through station info list and if you find a match return it
        for (var cIndex = 0; cIndex < this.stationInformationList.length; cIndex++){
            var stationCode = this.stationInformationList[cIndex].Code;
            var stationName = this.stationInformationList[cIndex].Name;
            if (stationCode === theStationCode)
                return stationName;
        }
        // otherwise return null
        return null;
    },
    // --- INCIDENT STUFF ---
    // builds a full-text named list from the given line colors codes
    parseLinesAffectedForColors: function(theLinesAffected, theLinesList) {
        var cLinesAffected = theLinesAffected.toUpperCase();
        var cAllCodes = [ "BL", "GR", "OR", "RD", "SV", "YL" ];
        var cReturnLines = theLinesList;
        // check for each color code in the string, if found then
        // add code to the complete code string
        for (var cIndex = 0; cIndex < cAllCodes.length; cIndex++)
        {
            var cCode = cAllCodes[cIndex];
            if (cLinesAffected.includes(cCode) && (cReturnLines.indexOf(cCode) === -1))
                cReturnLines[cReturnLines.length] = cCode;
        }
        return cReturnLines;
    },
    // main function to parse incididents
    parseIncidents: function(theConfig, theIncidentList) {
        var descriptionList = [];
        var linesList = [];
        // iterate through incident list
        // add each description to the description list, TODO: use this list
        // parse the lines affect for colors and track all color lines
        // for any incidents
        for (var cIndex = 0; cIndex < theIncidentList.length; cIndex++){
            var incident = theIncidentList[cIndex];
            descriptionList[descriptionList.length] = incident.Description;
            linesList = this.parseLinesAffectedForColors(incident.LinesAffected, linesList);
        }
        // return the module ID, description list, and list of color line incidents
        var returnPayload = {
            identifier: theConfig.identifier,
            descriptionList: descriptionList,
            linesList: linesList
        };
        // send back to module
        this.sendSocketNotification("DCMETRO_INCIDENT_UPDATE", returnPayload);
    },
    // makes the call to get the incidents
    updateIncidents: function(theConfig){
        // create the REST API call URL
        var wmataIncidentURL =
            "https://api.wmata.com/Incidents.svc/json/Incidents?api_key="
            + theConfig.wmata_api_key;
        // create a self to use in the async call
        var self = this;
        if (!this.stopUpdates) {
            https.get(wmataIncidentURL, (res) => {
                let rawData = "";
                res.on("data", (chunk) => rawData += chunk);
                res.on("end", () => {
                    // once you have all the data send it to be parsed
                    self.parseIncidents(theConfig, JSON.parse(rawData).Incidents);
                });
            }).on("error", (e) => { self.processError(e); });
        }
    },
    // --- STATION TRAIN TIME STUFF ---
    // checks if the destination code is in not the list destinations to exclue
    // returns true if not found
    // return false if found
    doesNotContainExcludedDestination: function(theConfig, theStationCode, theDestinationCode) {
        // iterate through destinations to exclude, if one matches return false
        for (var cIndex = 0; cIndex < theConfig.destinationsToExcludeList.length; cIndex++) {
            var destToExclude = theConfig.destinationsToExcludeList[cIndex];
            if (theDestinationCode === destToExclude)
                return false;
        }
        // otherwise return true
        return true;
    },
    // checks that train time string is not less than the configured time
    // to show it
    isNotLessThanConfigThreshold: function(theConfig, theMin) {
        if (theConfig.hideTrainTimesLessThan === 0)
            return true;
        var cMin = theMin;
        if ((cMin === "BRD") || (cMin === "ARR"))
            cMin = 0;
        cMin = parseInt(cMin);
        if (cMin < theConfig.hideTrainTimesLessThan)
            return false;
        return true;
    },
    // builds part of the REST API URL query to call based on station codes
    getTrainQuery: function(theConfig) {
        var returnQuery = "";
        var list = theConfig.stationsToShowList;
        // list is comma delimited station codes, build accordingly and return it
        for (var cIndex = 0; cIndex < list.length; cIndex++) {
            var stationCode = list[cIndex];
            returnQuery += stationCode;
            if (cIndex !== (list.length - 1))
                returnQuery += ",";
        }
        return returnQuery;
    },
    // build an empty station train times list to return in the payload
    // return is a JSON object with keys of the station codes
    // contains the station name and the list of train times
    getEmptyStationTrainTimesList: function(theConfig) {
        var returnList = {};
        for (var cIndex = 0; cIndex < theConfig.stationsToShowList.length; cIndex++) {
            var stationCode = theConfig.stationsToShowList[cIndex];
            var stationName = this.getStationName(stationCode);
            if (returnList[stationCode] === undefined)
            {
                var initStationPart = { StationName: stationName,
                    StationCode: stationCode,
                    TrainList: []
                };
                returnList[stationCode] = initStationPart;
            }
        }
        return returnList;
    },
    // does the work of parsing the train times from the REST call
    parseTrainTimes: function(theConfig, theTrains) {
        console.log("Metro node_helper: parseTrainTimes");
        // build an empty list in case some stations have no trains times
        var stationTrainList = this.getEmptyStationTrainTimesList(theConfig);
        // iterate through the train times list
        for (var cIndex = 0; cIndex < theTrains.length; cIndex++) {
            var train = theTrains[cIndex];
            // make sure there is a destination code
            if (train.DestinationCode !== null) {
                // get all the parts of the train time
                var tLocationCode     = train.LocationCode;
                var tLocationName     = train.LocationName;
                var tDestinationName  = train.DestinationName;
                var tDestinationCode  = train.DestinationCode;
                var tLine             = train.Line;
                var tMin              = train.Min;
                var trainListPart = stationTrainList[tLocationCode].TrainList;
                var tDestination;

                // if value is set in the config for showDestinationFullName, use that value
                if (theConfig.showDestinationFullName == "true") {
                    tDestination = this.getStationName(tDestinationCode);
                } else {
                    tDestination = train.Destination;
                }


                // build the train part
                var trainPart = { Destination: tDestination,
                    DestinationName: tDestinationName,
                    DestinationCode: tDestinationCode,
                    Line: tLine,
                    Min: tMin
                };
                // if destination code isn't on the list of exclusions and
                // it is not missing any of the required fields, then add
                // it to the list
                if ( (this.doesNotContainExcludedDestination(theConfig, tLocationCode, tDestinationCode))
                    && this.isNotLessThanConfigThreshold(theConfig, tMin)
                    && (tDestinationCode !== "")
                    && (tDestinationName !== "Train")
                    && (tLine !== "--")
                    && (tMin !== "") )
                    trainListPart[trainListPart.length] = trainPart;
                // set the main station train list object to the train list part
                stationTrainList[tLocationCode].TrainList = trainListPart;
            }
        }
        // return payload is the module id and the station train list
        var returnPayload = {
            identifier: theConfig.identifier,
            stationTrainList: stationTrainList
        };
        // send the payload back to the module
        this.sendSocketNotification("DCMETRO_STATIONTRAINTIMES_UPDATE", returnPayload);
    },


    // makes the call to get the train times list
    updateArrivalTimes: function(theConfig) {
        if (this.stopUpdates) return;

        var self = this;
        var opts = {
            hostname: 'api.wmata.com',
            headers: { api_key: theConfig.wmata_api_key }
        };
        // get query part of the REST API URL
        var trainQuery = self.getTrainQuery(theConfig);
        // build the full URL call
        opts.path = "/StationPrediction.svc/json/GetPrediction/" + trainQuery;
        https.get(opts, (res) => {
            let rawData = "";
            res.on("data", (chunk) => rawData += chunk);
            res.on("end", () => {
                // once you have all the data send it to be parsed
                self.parseTrainTimes(theConfig, JSON.parse(rawData).Trains);
            });
        }).on("error", (e) => { self.processError(e); });

        var buses = theConfig.busStopsToShowList;
        for (var i = 0; i < buses.length; i++) {
            opts.path = "/NextBusService.svc/json/jPredictions?" +
                    "StopID=" + buses[i];
            https.get(opts, (res) => {
                let rawData = "";
                res.on("data", (chunk) => rawData += chunk);
                res.on("end", () => {
                    // once you have all the data send it to be parsed
                    self.parseBusTimes(theConfig, JSON.parse(rawData));
                });
            }).on("error", (e) => { self.processError(e); });
        }
    },

    parseBusTimes: function(theConfig, busData) {

        var ret = [];
        var predictions = busData.Predictions;

        for (var i = 0; i < predictions.length; i++) {
            var bus = predictions[i];
            ret.push({
                minutes: bus.Minutes,
                routeID: bus.RouteID,
                directionText: bus.DirectionText
            });
        }
        this.sendSocketNotification("DCMETRO_BUSTIMES_UPDATE", {
            identifier: theConfig.identifier,
            stopName: busData.StopName,
            busTimes: ret
        });
    }
});

//------------ END -------------
