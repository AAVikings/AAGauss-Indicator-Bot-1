var LRCIndicator = require('./LRCIndicator');

exports.newUserBot = function newUserBot(BOT, COMMONS, UTILITIES, DEBUG_MODULE, BLOB_STORAGE, FILE_STORAGE) {
    const FULL_LOG = true;
    const LOG_FILE_CONTENT = false;
    const USE_PARTIAL_LAST_CANDLE = true; // When running live the last candle generated is a partial candle.

    let bot = BOT;
    
    const MODULE_NAME = "User Bot";

    const EXCHANGE_NAME = "Poloniex";
    
    const logger = DEBUG_MODULE.newDebugLog();
    logger.fileName = MODULE_NAME;
    logger.bot = bot;

    thisObject = {
        initialize: initialize,
        start: start
    };

    let gaussStorage = BLOB_STORAGE.newBlobStorage(bot);

    let utilities = UTILITIES.newUtilities(bot);

    let statusDependencies;
    
    return thisObject;

    function initialize(pStatusDependencies, pMonth, pYear, callBackFunction) {

        try {

            logger.fileName = MODULE_NAME;

            if (FULL_LOG === true) { logger.write("[INFO] initialize -> Entering function."); }
            
            statusDependencies = pStatusDependencies;

            gaussStorage.initialize({ bot: "AAGauss", devTeam: "AAMasters" }, onGaussInizialized);

            function onGaussInizialized(err) {

                if (err.result === global.DEFAULT_OK_RESPONSE.result) {

                    if (FULL_LOG === true) { logger.write("[INFO] initialize -> onGaussInizialized -> Initialization Succeed."); }
                    callBackFunction(global.DEFAULT_OK_RESPONSE);

                } else {
                    logger.write("[ERROR] initialize -> onGaussInizialized -> err = " + err.message);
                    callBackFunction(err);
                }
            }

        } catch (err) {
            logger.write("[ERROR] initialize -> err = " + err.message);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    /*
        TODO Create Description
    */

    function start(callBackFunction) {

        try {

            if (FULL_LOG === true) { logger.write("[INFO] start -> Entering function."); }

            let market = global.MARKET;
            let reportFilePath = EXCHANGE_NAME + "/Processes/" + bot.process;

            let lastCandles;
            
            getContextVariables();

            function getContextVariables() {

                try {

                    if (FULL_LOG === true) { logger.write("[INFO] start -> getContextVariables -> Entering function."); }
                    
                    let reportKey = "AAMasters" + "-" + "AAGauss" + "-" + "Multi-Period-Daily" + "-" + "dataSet.V1";
                    if (FULL_LOG === true) { logger.write("[INFO] start -> getContextVariables -> reportKey = " + reportKey); }

                    if (statusDependencies.statusReports.get(reportKey).status === "Status Report is corrupt.") {
                        logger.write("[ERROR] start -> getContextVariables -> Can not continue because self dependecy Status Report is corrupt. Aborting Process.");
                        callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                        return;
                    }

                    let thisReport = statusDependencies.statusReports.get(reportKey).file;
                    if (thisReport.lastCandles !== undefined) {
                        logger.write("[INFO] start -> getContextVariables -> thisReport.lastCandles: " + JSON.stringify(thisReport.lastCandles));
                        lastCandles = thisReport.lastCandles;

                        periodsLoop();

                    } else {
                        lastCandles = [];
                        for (n = 0; n < global.dailyFilePeriods.length; n++) {
                            lastCandles.push(0);
                        }

                        periodsLoop();

                    }

                } catch (err) {
                    logger.write("[ERROR] start -> getContextVariables -> err = " + err.message);
                    if (err.message === "Cannot read property 'file' of undefined") {
                        logger.write("[HINT] start -> getContextVariables -> Check the bot configuration to see if all of its statusDependencies declarations are correct. ");
                        logger.write("[HINT] start -> getContextVariables -> Dependencies loaded -> keys = " + JSON.stringify(statusDependencies.keys));
                    }
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function periodsLoop() {

                let n = 0   // loop Variable representing each possible period as defined at the periods array.
                
                loopBody();

                function loopBody() {

                    if (FULL_LOG === true) { logger.write("[INFO] start -> buildLRCChannels -> periodsLoop -> loopBody -> Entering function. Time: " + bot.processDatetime.toISOString() + ". Loop: "+n); }

                    const outputPeriod = global.dailyFilePeriods[n][0];
                    const folderName = global.dailyFilePeriods[n][1];

                    isTimeToRun();

                    function isTimeToRun() {
                        let nextExecution = lastCandles[n] + outputPeriod;
                        if (bot.processDatetime.valueOf() >= nextExecution) {
                            getCandles();
                        } else {

                            if (FULL_LOG === true) logger.write("[INFO] start -> periodsLoop -> loopBody -> It's not time to run this period.");
                            controlLoop();
                        }
                    }

                    function getCandles() {

                        if (FULL_LOG === true) { logger.write("[INFO] start -> getCandles -> Entering function."); }

                        const maxLRCDepth = 63;
                        const maxBackwardsCount = 60;

                        let backwardsCount = 0;
                        let candleArray = [];

                        let queryDate = new Date(bot.processDatetime);
                        let candleFile = getDailyFile(queryDate, onDailyFileReceived);

                        function onDailyFileReceived(err, candleFile) {
                            if (FULL_LOG === true) { logger.write("[INFO] start -> getCandles -> onDailyFileReceived."); }

                            if (err.result === global.DEFAULT_OK_RESPONSE.result) {
                                for (let i = 0; i < candleFile.length; i++) {
                                    let candle = {
                                        open: undefined,
                                        close: undefined,
                                        min: 10000000000000,
                                        max: 0,
                                        begin: undefined,
                                        end: undefined
                                    };

                                    candle.min = candleFile[i][0];
                                    candle.max = candleFile[i][1];

                                    candle.open = candleFile[i][2];
                                    candle.close = candleFile[i][3];

                                    candle.begin = candleFile[i][4];
                                    candle.end = candleFile[i][5];

                                    if (LOG_FILE_CONTENT === true) { logger.write("[INFO] Candle Date: " + new Date(candle.begin).toISOString() + ". Process Date: " + bot.processDatetime.toISOString()); }

                                    if (candleArray.length < maxLRCDepth && candle.begin <= bot.processDatetime.valueOf()) {
                                        candleArray.push(candleFile[i]);
                                    }
                                }

                                if (FULL_LOG === true) { logger.write("[INFO] start -> getCandles -> Candle Array Length: " + candleArray.length); }

                                if (candleArray.length >= maxLRCDepth) {
                                    if (FULL_LOG === true) { logger.write("[INFO] start -> getCandles -> All candles available proceed with LRC calculations."); }

                                    let lrcChannel = performLRCCalculations(candleArray);
                                    saveChannel(lrcChannel);

                                } else if (backwardsCount <= maxBackwardsCount) {
                                    if (FULL_LOG === true) { logger.write("[INFO] start -> getChannelTilt -> Getting file for day before."); }

                                    queryDate.setDate(queryDate.getDate() - 1);
                                    getDailyFile(queryDate, onDailyFileReceived);
                                    backwardsCount++;
                                } else {
                                    logger.write("[ERROR] start -> getChannelTilt -> Not enough history to calculate LRC.");
                                    callBack(global.DEFAULT_RETRY_RESPONSE);
                                }
                            }
                        }

                        function getDailyFile(dateTime, onDailyFileReceived) {
                            try {
                                if (FULL_LOG === true) { logger.write("[INFO] start -> getCandles -> getDailyFile -> Entering function."); }

                                let datePath = dateTime.getUTCFullYear() + "/" + utilities.pad(dateTime.getUTCMonth() + 1, 2) + "/" + utilities.pad(dateTime.getUTCDate(), 2);
                                let filePath = "AAMasters/AAOlivia.1.0/AACloud.1.1/Poloniex/dataSet.V1/Output/Candles/Multi-Period-Daily/" + folderName + "/" + datePath;
                                let fileName = market.assetA + '_' + market.assetB + ".json"

                                gaussStorage.getTextFile(filePath, fileName, onFileReceived);

                                function onFileReceived(err, text) {
                                    if (err.result === global.DEFAULT_OK_RESPONSE.result) {
                                        if (FULL_LOG === true) { logger.write("[INFO] start -> getCandles -> getDailyFile -> onFileReceived > Entering Function."); }

                                        let candleFile = JSON.parse(text);
                                        onDailyFileReceived(global.DEFAULT_OK_RESPONSE, candleFile);
                                    } else {
                                        logger.write("[ERROR] start -> getCandles -> getDailyFile -> onFileReceived -> Failed to get the file. Will abort the process and request a retry.");
                                        callBackFunction(global.DEFAULT_RETRY_RESPONSE);
                                        return;
                                    }
                                }
                            } catch (err) {
                                logger.write("[ERROR] start -> getCandles -> getDailyFile -> err = " + err.message);
                                callBackFunction(global.DEFAULT_RETRY_RESPONSE);
                            }
                        }

                        function performLRCCalculations(candleArray) {

                            if (FULL_LOG === true) { logger.write("[INFO] start -> performLRCCalculations -> Entering function."); }

                            /*
                            * It's needed to order since it's possible that we need to get another file and it will put an older candle at the end of the array.
                            */
                            candleArray.sort(function (a, b) {
                                return a[4] - b[4];
                            });

                            if (USE_PARTIAL_LAST_CANDLE === false) candleArray = candleArray.slice(0, candleArray.length - 1);

                            let lrcPoints = calculateLRC(candleArray);

                            let firstCandle = candleArray[0];
                            let lastCandle = candleArray[candleArray.length - 1];

                            lrcPoints[6] = firstCandle[4];
                            lrcPoints[7] = lastCandle[4];

                            let lrc15 = lrcPoints[1];
                            let lrc30 = lrcPoints[2];
                            let lrc60 = lrcPoints[3];
                            
                            /*
                            * We take the last candle (because it's the newest) and calculate the LRC points again to detect the tilt.
                            */

                            let previousCandleArray = candleArray.slice(0, candleArray.length - 1);
                            let lrcPreviousPoints = calculateLRC(previousCandleArray);

                            let previousLrc15 = lrcPreviousPoints.minimumChannelValue;
                            let previousLrc30 = lrcPreviousPoints.middleChannelValue;
                            let previousLrc60 = lrcPreviousPoints.maximumChannelValue;

                            if (lrc60 < lrc30 && lrc15 > lrc30 && lrc30 < lrc15) {
                                if (lrc15 > previousLrc15 && lrc30 > previousLrc30 && lrc60 > previousLrc60) {
                                    lrcPoints[4] = 1; // The channel points UP
                                    lrcPoints[5] += "1.";
                                }
                            }

                            if (lrc15 < lrc30 && lrc60 > lrc30 && lrc30 < lrc60) {
                                if (lrc15 < previousLrc15 && lrc30 < previousLrc30 && lrc60 < previousLrc60) {
                                    lrcPoints[4] = -1; // The channel points DOWN
                                    lrcPoints[5] += "2.";
                                }
                            }

                            if (lrc15 < previousLrc15 && lrc30 <= previousLrc30) {
                                // 15 AND 30 changed direction from up to down
                                lrcPoints[4] = -1;
                                lrcPoints[5] += "3a.";
                            }

                            if (lrc15 > previousLrc15 && lrc30 >= previousLrc30) {
                                // 15 AND 30 changed direction from down to up
                                lrcPoints[4] = 1;
                                lrcPoints[5] += "3b.";
                            }

                            let logMessage = bot.processDatetime.toISOString() + "\t" + lrcPoints[5] + "\t" + lrcPoints[4] + "\t" + lrc15 + "\t" + lrc30 + "\t" + lrc60;

                            if (FULL_LOG === true) { logger.write("[INFO] start -> getChannelTilt -> performLRCCalculations -> Results: " + logMessage); }

                            return lrcPoints;
                        }

                        function calculateLRC(candlesArray) {

                            if (FULL_LOG === true) { logger.write("[INFO] start -> getChannelTilt -> calculateLRC -> Entering function."); }

                            let lrcPoints = [];
                            lrcPoints.push(bot.processDatetime.valueOf()); //Date   0
                            lrcPoints.push(0); //minimumChannelValue                1
                            lrcPoints.push(0); //middleChannelValue                 2
                            lrcPoints.push(0); //maximumChannelValue                3
                            lrcPoints.push(0); //channelTilt                        4
                            lrcPoints.push(""); //rule                              5
                            lrcPoints.push(0); //firstCandleTime                    6
                            lrcPoints.push(0); //lastCandleTime                     7

                            if (LOG_FILE_CONTENT === true) lrcPoints.push(candlesArray);

                            let lrcMinIndicator = new LRCIndicator(15);
                            let lrcMidIndicator = new LRCIndicator(30);
                            let lrcMaxIndicator = new LRCIndicator(60);

                            for (let i = 0; i < candlesArray.length; i++) {
                                let tempCandle = candlesArray[i];
                                let averagePrice = (tempCandle[0] + tempCandle[1] + tempCandle[2] + tempCandle[3]) / 4; // TODO Check which price should be take to get the LRC

                                lrcMinIndicator.update(averagePrice);
                                lrcMidIndicator.update(averagePrice);
                                lrcMaxIndicator.update(averagePrice);
                            }

                            if (FULL_LOG === true) {
                                logger.write("[INFO] start -> getChannelTilt -> calculateLRC -> Values: " + "lrcMinIndicator: " + lrcMinIndicator.result + ". lrcMidIndicator: "
                                    + lrcMidIndicator.result + ". lrcMaxIndicator: " + lrcMaxIndicator.result);
                            }

                            /*
                                * Only if there is enough history the result will be calculated
                                */
                            if (lrcMinIndicator.result != false && lrcMidIndicator.result != false && lrcMaxIndicator.result != false) {
                                lrcPoints[1] = lrcMinIndicator.result;
                                lrcPoints[2] = lrcMidIndicator.result;
                                lrcPoints[3] = lrcMaxIndicator.result;

                                return lrcPoints;
                            } else {
                                logger.write("[ERROR] start -> getChannelTilt -> calculateLRC -> There is not enough history to calculate the LRC.");
                                callBackFunction(global.DEFAULT_RETRY_RESPONSE);
                            }
                        }

                        function saveChannel(lrcChannel) {

                            try {

                                if (FULL_LOG === true) { logger.write("[INFO] start -> saveChannel -> Entering function."); }
                                let fileContent;
                                let datePath = bot.processDatetime.getUTCFullYear() + "/" + utilities.pad(bot.processDatetime.getUTCMonth() + 1, 2) + "/" + utilities.pad(bot.processDatetime.getUTCDate(), 2);
                                let filePath = bot.filePathRoot + "/Output/LRC-Channel/Multi-Period-Daily/" + folderName + "/" + datePath;
                                let fileName = market.assetA + '_' + market.assetB + ".json"

                                if (FULL_LOG === true) { logger.write("[INFO] start -> buildLRCChannels -> periodsLoop -> loopBody -> getCurrentContent -> fileName = " + fileName); }
                                if (FULL_LOG === true) { logger.write("[INFO] start -> buildLRCChannels -> periodsLoop -> loopBody -> getCurrentContent -> filePath = " + filePath); }

                                gaussStorage.getTextFile(filePath, fileName, onFileRetrieved);

                                function onFileRetrieved(err, text) {

                                    if (FULL_LOG === true) { logger.write("[INFO] start -> onFileRetrieved -> Entering function."); }

                                    if (err.result !== global.DEFAULT_OK_RESPONSE.result) {

                                        if (err.message === "File does not exist.") {
                                            if (FULL_LOG === true) { logger.write("[INFO] start -> onFileRetrieved -> Daily file does not exist, creating folders."); }

                                            createFolders(filePath);
                                            return;
                                        } else {
                                            logger.write("[ERROR] start -> onFileRetrieved -> err = " + err.message);
                                            callBackFunction(err);
                                            return;
                                        }
                                    }

                                    if (FULL_LOG === true) { logger.write("[INFO] start -> onFileRetrieved -> Daily file exist, appending content."); }

                                    fileContent = JSON.parse(text);
                                    appendToFile(fileContent);
                                }


                                function createFolders(filePath) {

                                    try {

                                        if (FULL_LOG === true) { logger.write("[INFO] start -> createFolders -> Entering function."); }

                                        utilities.createFolderIfNeeded(filePath, gaussStorage, onFolderACreated);

                                        function onFolderACreated(err) {

                                            if (FULL_LOG === true) { logger.write("[INFO] start -> createFolders -> onFolderACreated -> Entering function."); }

                                            if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                                                logger.write("[ERROR] start -> createFolders -> onFolderACreated -> err = " + err.message);
                                                callBackFunction(err);
                                                return;
                                            }

                                            utilities.createFolderIfNeeded(reportFilePath, gaussStorage, onFolderCreated);
                                        }

                                        function onFolderCreated(err) {

                                            if (FULL_LOG === true) { logger.write("[INFO] start -> createFolders -> onFolderCreated -> Entering function."); }

                                            if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                                                logger.write("[ERROR] start -> createFolders -> onFolderCreated -> err = " + err.message);
                                                callBackFunction(err);
                                                return;
                                            }
                                            createFile();
                                        }

                                    } catch (err) {
                                        logger.write("[ERROR] start -> createFolders -> err = " + err.message);
                                        callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                    }
                                }

                                function createFile() {

                                    if (FULL_LOG === true) { logger.write("[INFO] start -> saveChannel -> createFile -> Entering function."); }

                                    let existingContent = [];
                                    existingContent.push(lrcChannel);

                                    gaussStorage.createTextFile(filePath, fileName, JSON.stringify(existingContent), onFileCreated);

                                    function onFileCreated(err) {

                                        if (FULL_LOG === true) { logger.write("[INFO] start -> saveChannel -> onFileCreated -> Entering function."); }

                                        if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                                            logger.write("[ERROR] start -> saveChannel -> onFileCreated -> err = " + err.message);
                                            callBackFunction(err);
                                            return;
                                        }

                                        if (LOG_FILE_CONTENT === true) {
                                            logger.write("[INFO] start -> saveChannel -> onFileCreated ->  Content written = " + JSON.stringify(existingContent));
                                        }

                                        // We keep a record of the last candle used for the time period
                                        lastCandles[n] = lrcChannel[7];

                                        controlLoop();
                                    }
                                }

                                function appendToFile(fileContent) {

                                    if (FULL_LOG === true) { logger.write("[INFO] start -> saveChannel -> appendToFile -> Entering function."); }

                                    fileContent.push(lrcChannel);

                                    gaussStorage.createTextFile(filePath, fileName, JSON.stringify(fileContent), onExistingFileUpdated);

                                    function onExistingFileUpdated(err) {

                                        if (FULL_LOG === true) { logger.write("[INFO] start -> saveChannel -> onExistingFileUpdated -> Entering function."); }

                                        if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                                            logger.write("[ERROR] start -> saveChannel -> onExistingFileUpdated -> err = " + err.message);
                                            callBackFunction(err);
                                            return;
                                        }

                                        if (LOG_FILE_CONTENT === true) {
                                            logger.write("[INFO] start -> saveChannel -> onExistingFileUpdated ->  Content written = " + JSON.stringify(fileContent));
                                        }

                                        // We keep a record of the last candle used for the time period
                                        lastCandles[n] = lrcChannel[7];

                                        controlLoop();
                                    }
                                }
                            } catch (err) {
                                logger.write("[ERROR] start -> saveChannel -> err = " + err.message);
                                callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                            }
                        }
                    }
                }

                function controlLoop() {

                    if (FULL_LOG === true) { logger.write("[INFO] start -> buildLRCChannels -> periodsLoop -> controlLoop -> Entering function."); }

                    n++;

                    if (n < global.dailyFilePeriods.length) {

                        loopBody();

                    } else {
                            
                        writeStatusReport();

                    }
                }

            }

            function writeStatusReport() {

                try {

                    if (FULL_LOG === true) { logger.write("[INFO] start -> writeStatusReport -> Entering function."); }

                    let key = bot.devTeam + "-" + bot.codeName + "-" + bot.process + "-" + bot.dataSetVersion;

                    let statusReport = statusDependencies.statusReports.get(key);

                    statusReport.file.lastExecution = bot.processDatetime;
                    statusReport.file.lastCandles = lastCandles;
                    statusReport.save(onSaved);

                    function onSaved(err) {

                        if (FULL_LOG === true) { logger.write("[INFO] start -> writeStatusReport -> onSaved -> Entering function."); }

                        if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                            logger.write("[ERROR] start -> writeStatusReport -> onSaved -> err = " + err.message);
                            callBackFunction(err);
                            return;
                        }

                        callBackFunction(global.DEFAULT_OK_RESPONSE);
                    }

                } catch (err) {
                    logger.write("[ERROR] start -> writeStatusReport -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }


        } catch (err) {
            logger.write("[ERROR] start -> err = " + err.message);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }
};
