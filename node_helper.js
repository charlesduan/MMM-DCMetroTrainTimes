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
// const querystring = require("querystring");
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
        if (notification === "REGISTER_CONFIG") {
            if (this.theConfig) { return; } // Don't register config twice
            this.theConfig = theConfig;
            this.wmata_api_key = theConfig.wmata_api_key;
            // create self reference for interval calls
            var self = this;
            // load in the station information list
            this.loadStationInformationList(theConfig.path);
            this.loadAggregateDestinations(theConfig.aggregateDestinations);

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

    callWmataApi: function(path, callback) {
        var opts = {
            hostname: "api.wmata.com",
            headers: { api_key: this.wmata_api_key },
            path: path
        };
        https.get(opts, (res) => {
            let rawData = "";
            res.on("data", (chunk) => { rawData += chunk; });
            res.on("end", () => { callback(rawData); });
        }).on("error", (e) => { self.processError(e); });
    },

    loadAggregateDestinations: function(list) {
        this.destinationNameMap = new Map();
        for (let group of list) {
            for (let item of group) {
                this.destinationNameMap.set(item, group[0]);
            }
        }
    },

    // Aggregate an array of arrival time data
    // Parameters:
    //   list:        List of arrival objects
    //   line:        Object key for line name
    //   destination: Object key for destination description
    //   time:        Object key for time data
    aggregateArrivals: function(list, line, destination, time) {
        var seen = new Map();
        for (let arrival of list) {
            let dest = this.destinationNameMap.get(arrival[destination]) ||
                arrival[destination];
            let data = seen.get(dest);
            if (data === undefined) {
                seen.set(dest, {
                    times: [ arrival[time] ],
                    lines: [ arrival[line] ],
                });
            } else {
                data.times.push(arrival[time]);
                if (!data.lines.includes(arrival[line])) {
                    data.lines.push(arrival[line]);
                }
            }
        }
        var res = [];
        for (let [dest, data] of seen) {
            res.push({
                [line]: data.lines.join("/"),
                [destination]: dest,
                [time]: data.times.join(", "),
            });
        }
        return res;
    },

    // increment error count, if passed limit send notice to module
    processError: function(e) {
        this.errorCount += 1;
        var self = this;
        if (this.errorCount >= errorFailLimit) {
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
            var fileData = fs.readFileSync(path +
                    "/stationcodes/stationcodes.json");
            this.stationInformationList = JSON.parse(fileData);
        }
    },
    // get the station name for a given station code
    getStationName: function(theStationCode) {
        var info = this.stationInformationList;
        // iterate through station info list and if you find a match return it
        for (var cIndex = 0; cIndex < info.length; cIndex++) {
            var stationCode = info[cIndex].Code;
            var stationName = info[cIndex].Name;
            if (stationCode === theStationCode) return stationName;
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
        cAllCodes.forEach((cCode) => {
            if (cLinesAffected.includes(cCode) &&
                !cReturnLines.includes(cCode)) {
                cReturnLines.push(cCode);
            }
        });
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
        theIncidentList.forEach((incident) => {
            descriptionList.push(incident.Description);
            linesList = this.parseLinesAffectedForColors(
                incident.LinesAffected, linesList
            );
        });
        // return the module ID, description list, and list of color line
        // incidents
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
        if (this.stopUpdates) return;
        var self = this;
        this.callWmataApi("/Incidents.svc/json/Incidents", (data) => {
            self.parseIncidents(theConfig, JSON.parse(data).Incidents);
        });
    },
    // --- STATION TRAIN TIME STUFF ---
    // checks if the destination code is in not the list destinations to exclue
    // returns true if not found
    // return false if found
    doesNotContainExcludedDestination: function(theConfig, theStationCode,
            theDestinationCode) {
        // iterate through destinations to exclude, if one matches return false
        var exclude = theConfig.destinationsToExcludeList;
        for (var cIndex = 0; cIndex < exclude.length; cIndex++) {
            var destToExclude = exclude[cIndex];
            if (theDestinationCode === destToExclude) {return false;}
        }
        // otherwise return true
        return true;
    },
    // checks that train time string is not less than the configured time
    // to show it
    meetsConfigThreshold: function(theConfig, theMin) {
        if (theConfig.hideTrainTimesLessThan === 0) {return true;}
        var cMin = theMin;
        if ((cMin === "BRD") || (cMin === "ARR")) {cMin = 0;}
        cMin = parseInt(cMin);
        if (cMin < theConfig.hideTrainTimesLessThan) {return false;}
        return true;
    },

    // build an empty station train times list to return in the payload
    // return is a JSON object with keys of the station codes
    // contains the station name and the list of train times
    getEmptyStationTrainTimesList: function(theConfig) {
        var returnList = {};
        for (var stationCode of theConfig.stationsToShowList) {
            returnList[stationCode] = {
                StationName: this.getStationName(stationCode),
                StationCode: stationCode,
                TrainList: []
            };
        }
        return returnList;
    },
    // does the work of parsing the train times from the REST call
    parseTrainTimes: function(theConfig, theTrains) {
        // build an empty list in case some stations have no trains times
        var stationTrainList = this.getEmptyStationTrainTimesList(theConfig);
        // iterate through the train times list
        for (var train of theTrains) {
            // make sure there is a destination code
            if (train.DestinationCode === null) continue;
            if (!this.doesNotContainExcludedDestination(theConfig,
                train.LocationCode, train.DestinationCode)) continue;
            if (!this.meetsConfigThreshold(theConfig, train.Min)) continue;
            if (train.DestinationCode === "") continue;
            if (train.DestinationName === "Train") continue;
            if (train.Line === "--") continue;
            if (train.Min === "") continue;

            // if value is set in the config for showDestinationFullName,
            // use that value
            var tDestination;
            if (theConfig.showDestinationFullName == "true") {
                tDestination = this.getStationName(train.DestinationCode);
            } else {
                tDestination = train.Destination;
            }

            stationTrainList[train.LocationCode].TrainList.push({
                Destination: tDestination,
                Line: train.Line,
                Min: train.Min
            });
        }
        for (let trainLC of Object.keys(stationTrainList)) {
            stationTrainList[trainLC].TrainList = this.aggregateArrivals(
                stationTrainList[trainLC].TrainList,
                "Line", "Destination", "Min"
            );
        }
        // return payload is the module id and the station train list
        var returnPayload = {
            identifier: theConfig.identifier,
            stationTrainList: stationTrainList
        };
        // send the payload back to the module
        this.sendSocketNotification(
            "DCMETRO_STATIONTRAINTIMES_UPDATE",
            returnPayload
        );
    },


    // makes the call to get the train times list
    updateArrivalTimes: function(theConfig) {
        if (this.stopUpdates) return;

        var self = this;
        // get query part of the REST API URL
        // build the full URL call
        this.callWmataApi(
            "/StationPrediction.svc/json/GetPrediction/" +
                theConfig.stationsToShowList.join(","),
            (data) => {
                self.parseTrainTimes(theConfig, JSON.parse(data).Trains);
            }
        );

        var buses = theConfig.busStopsToShowList;
        for (var i = 0; i < buses.length; i++) {
            let stopID = buses[i];
            this.callWmataApi(
                "/NextBusService.svc/json/jPredictions?" + "StopID=" + stopID,
                (data) => {
                    self.parseBusTimes(theConfig, stopID, JSON.parse(data));
                }
            );
        }
    },

    parseBusTimes: function(theConfig, stopID, busData) {

        var ret = this.aggregateArrivals(
            busData.Predictions.map((bus) => {
                return {
                    minutes: bus.Minutes,
                    routeID: bus.RouteID,
                    directionText: bus.DirectionText
                };
            }),
            "routeID", "directionText", "minutes"
        );
        this.sendSocketNotification("DCMETRO_BUSTIMES_UPDATE", {
            identifier: theConfig.identifier,
            stopName: busData.StopName,
            stopID: stopID,
            busTimes: ret
        });
    }
});

//------------ END -------------
