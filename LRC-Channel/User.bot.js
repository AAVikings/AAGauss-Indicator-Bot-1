var LRCIndicator = require('./LRCIndicator');

exports.newUserBot = function newUserBot(BOT, COMMONS, UTILITIES, DEBUG_MODULE, BLOB_STORAGE, STATUS_REPORT, POLONIEX_CLIENT_MODULE) {

    const FULL_LOG = true;
    const LOG_FILE_CONTENT = true;

    let bot = BOT;

    const GMT_MILI_SECONDS = '000';

    const MODULE_NAME = "User Bot";

    const EXCHANGE_NAME = "Poloniex";

    const LRC_FOLDER_NAME = "LRC-Channel";

    const logger = DEBUG_MODULE.newDebugLog();
    logger.fileName = MODULE_NAME;
    logger.bot = bot;

    thisObject = {
        initialize: initialize,
        start: start
    };

    let gaussStorage = BLOB_STORAGE.newBlobStorage(bot);

    let utilities = UTILITIES.newUtilities(bot);
    let poloniexApiClient = new POLONIEX_CLIENT_MODULE();

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

            let currentDate = bot.processDatetime;                // This will hold the current datetime of each execution.
            let marketQueue;                // This is the queue of all markets to be procesesd at each interval.
            let candlePeriod = 1800;        // Period for 30-min candle in seconds.
            const maxLRCDepth = 62;         // 61 to be able to calculate current lrc60, plus one to calculate previous lrc60
            let exchangeCallTime;

            let reportFilePath = EXCHANGE_NAME + "/Processes/" + bot.process;

            let dateForPath = currentDate.getUTCFullYear() + '/' + utilities.pad(currentDate.getUTCMonth() + 1, 2) + '/' + utilities.pad(currentDate.getUTCDate(), 2);
            let filePath = bot.filePathRoot + "/Output/" + LRC_FOLDER_NAME + '/' + dateForPath;
            let fileName = '' + market.assetA + '_' + market.assetB + '.json';
            let fileContent;

            gaussStorage.getTextFile(filePath, fileName, onFileRetrieved);

            function onFileRetrieved(err, text) {

                if (FULL_LOG === true) { logger.write("[INFO] start -> onFileRetrieved -> Entering function."); }

                if (err.result !== global.DEFAULT_OK_RESPONSE.result) {

                    if (err.message === "File does not exist.") { // For now just create a new one, TODO check the previous execution.
                        if (FULL_LOG === true) { logger.write("[INFO] start -> onFileRetrieved -> Daily file does not exist, executing bot."); }

                        createFolders();
                        return;
                    } else {

                        logger.write("[ERROR] start -> onFileRetrieved -> err = " + err.message);
                        callBackFunction(err);
                        return;
                    }
                }
                
                if (FULL_LOG === true) { logger.write("[INFO] start -> onFileRetrieved -> Daily file exist checking if it's time to run the bot."); }
                    
                fileContent = JSON.parse(text);

                let lastLRCChannel = fileContent[fileContent.length - 1];
                let lastExecutionTime = lastLRCChannel.lastCandleTime;
                let newExecutionTime = lastExecutionTime + (30 * 60000);

                if (newExecutionTime < bot.processDatetime) {
                    if (FULL_LOG === true) { logger.write("[INFO] start -> onFileRetrieved -> It's time to run the bot."); }

                    createFolders();
                } else {
                    if (FULL_LOG === true) { logger.write("[INFO] start -> onFileRetrieved -> It's not time to run the bot."); }

                    callBackFunction(global.DEFAULT_OK_RESPONSE);
                }
                
            }
            
            function createFolders() {

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
                        getCandles(); 
                    }

                } catch (err) {
                    logger.write("[ERROR] start -> createFolders -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function getCandles() {

                try {

                    if (FULL_LOG === true) { logger.write("[INFO] start -> getCandles -> Entering function."); }

                    
                    const datetime = currentDate.valueOf() - (maxLRCDepth * candlePeriod * 1000);
                    const startTime = parseInt(datetime / 1000);
                    const endTime = parseInt(currentDate.valueOf() / 1000) ;

                    exchangeCallTime = new Date();
                    if (FULL_LOG === true) {
                        logger.write("[INFO] start -> getCandles -> Current Date: " + currentDate.valueOf()+". Start: " + startTime + ". End: " + endTime); }
                    poloniexApiClient.returnChartData(market.assetA, market.assetB, candlePeriod, startTime, endTime, onExchangeCallReturned);

                } catch (err) {
                    logger.write("[ERROR] start -> getCandles -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function onExchangeCallReturned(err, candleArray) {

                try {

                    if (FULL_LOG === true) { logger.write("[INFO] start -> onExchangeCallReturned -> Entering function."); }

                    if (FULL_LOG === true) {

                        let exchangeResponseTime = new Date();
                        let timeDifference = (exchangeResponseTime.valueOf() - exchangeCallTime.valueOf()) / 1000;
                        logger.write("[INFO] start -> onExchangeCallReturned -> Call time recorded = " + timeDifference + " seconds.");
                    }

                    poloniexApiClient.analizeResponse(logger, err, candleArray, callBackFunction, onResponseOk);

                    function onResponseOk() {

                        let lrcChannel = performLRCCalculations(candleArray);
                        saveChannel(lrcChannel);
                    }

                } catch (err) {
                    logger.write("[ERROR] start -> onExchangeCallReturned -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function saveChannel(lrcChannel) {

                try {

                    if (FULL_LOG === true) { logger.write("[INFO] start -> saveChannel -> Entering function."); }

                    if (fileContent === undefined) {
                        createFile();
                    } else {
                        let lastLRCChannel = fileContent[fileContent.length - 1];
                        let lastExecutionTime = lastLRCChannel.lastCandleTime;
                        let newExecutionTime = lrcChannel;

                        if (lastLRCChannel.lastCandleTime <= lrcChannel.lastCandleTime) {
                            if (FULL_LOG === true) { logger.write("[INFO] start -> saveChannel -> Last processed candle time is less than new candle."); }

                            writeStatusReport();
                        } else {
                            appendToFile(fileContent);
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

                            writeStatusReport();
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
                            
                            writeStatusReport();
                        }
                    }
                } catch (err) {
                    logger.write("[ERROR] start -> saveChannel -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function performLRCCalculations(candleArray) {

                if (FULL_LOG === true) { logger.write("[INFO] start -> performLRCCalculations -> Entering function."); }

                let lrcPoints = calculateLRC(candleArray);

                let lrc15 = lrcPoints.minimumChannelValue;
                let lrc30 = lrcPoints.middleChannelValue;
                let lrc60 = lrcPoints.maximumChannelValue;

                /**
                * We take the last candle (because it's the newest) and calculate the LRC points again to detect the tilt.
                */

                let previousCandleArray = candleArray.slice(0, candleArray.length - 1);
                let lrcPreviousPoints = calculateLRC(previousCandleArray);

                let previousLrc15 = lrcPreviousPoints.minimumChannelValue;
                let previousLrc30 = lrcPreviousPoints.middleChannelValue;
                let previousLrc60 = lrcPreviousPoints.maximumChannelValue;

                if (lrc60 < lrc30 && lrc15 > lrc30 && lrc30 < lrc15) {
                    if (lrc15 > previousLrc15 && lrc30 > previousLrc30 && lrc60 > previousLrc60) {
                        lrcPoints.channelTilt = 1; // The channel points UP
                        lrcPoints.rule += "1.";
                    }
                }

                if (lrc15 < lrc30 && lrc60 > lrc30 && lrc30 < lrc60) {
                    if (lrc15 < previousLrc15 && lrc30 < previousLrc30 && lrc60 < previousLrc60) {
                        lrcPoints.channelTilt = -1; // The channel points DOWN
                        lrcPoints.rule += "2.";
                    }
                }

                if (lrc15 < previousLrc15 && lrc30 <= previousLrc30) {
                    // 15 AND 30 changed direction from up to down
                    lrcPoints.channelTilt = -1;
                    lrcPoints.rule += "3a.";
                }

                if (lrc15 > previousLrc15 && lrc30 >= previousLrc30) {
                    // 15 AND 30 changed direction from down to up
                    lrcPoints.channelTilt = 1;
                    lrcPoints.rule += "3b.";
                }

                let logMessage = bot.processDatetime.toISOString() + "\t" + lrcPoints.rule + "\t" + lrcPoints.channelTilt + "\t" + lrc15 + "\t" + lrc30 + "\t" + lrc60;

                if (FULL_LOG === true) { logger.write("[INFO] start -> getChannelTilt -> performLRCCalculations -> Results: " + logMessage); }

                return lrcPoints;
            }

            function calculateLRC(candlesArray) {
                if (FULL_LOG === true) { logger.write("[INFO] start -> getChannelTilt -> calculateLRC -> Entering function."); }

                let minimumChannelDepth = 15;
                let middleChannelDepth = 30;
                let maximumChannelDepth = 60;

                let lrcPoints = {
                    datetime: bot.processDatetime.valueOf(),
                    minimumChannelValue: 0,
                    middleChannelValue: 0,
                    maximumChannelValue: 0,
                    lastCandleTime: 0,
                    channelTilt: 0,
                    rule: ""
                };

                let lrcMinIndicator = new LRCIndicator(minimumChannelDepth);
                let lrcMidIndicator = new LRCIndicator(middleChannelDepth);
                let lrcMaxIndicator = new LRCIndicator(maximumChannelDepth);
                let currentCandle = candlesArray[candlesArray.length - 1];

                for (let i = 0; i < candlesArray.length; i++) {
                    let tempCandle = candlesArray[i];
                    let averagePrice = tempCandle.weightedAverage; // TODO Check which price should be take to get the LRC
                    lrcMinIndicator.update(averagePrice);
                    lrcMidIndicator.update(averagePrice);
                    lrcMaxIndicator.update(averagePrice);
                }
                if (FULL_LOG === true) {
                    logger.write("[INFO] start -> getChannelTilt -> calculateLRC -> candlesArray.length: " + candlesArray.length + ". lrcMinIndicator: " + lrcMinIndicator.age + ". lrcMidIndicator: "
                        + lrcMidIndicator.age + ". lrcMaxIndicator: " + lrcMaxIndicator.age);

                }

                if (FULL_LOG === true) {
                    logger.write("[INFO] start -> getChannelTilt -> calculateLRC -> Values: " + "lrcMinIndicator: " + lrcMinIndicator.result + ". lrcMidIndicator: "
                        + lrcMidIndicator.result + ". lrcMaxIndicator: " + lrcMaxIndicator.result);
                }

                /*
                 * Only if there is enough history the result will be calculated
                 */
                if (lrcMinIndicator.result != false && lrcMidIndicator.result != false && lrcMaxIndicator.result != false) {
                    lrcPoints.minimumChannelValue = lrcMinIndicator.result;
                    lrcPoints.middleChannelValue = lrcMidIndicator.result;
                    lrcPoints.maximumChannelValue = lrcMaxIndicator.result;

                    lrcPoints.lastCandleTime = new Date(parseInt(currentCandle.date +  GMT_MILI_SECONDS)).valueOf();

                    return lrcPoints;
                } else {
                    logger.write("[ERROR] start -> getChannelTilt -> calculateLRC -> There is not enough history to calculate the LRC.");
                    callBackFunction(global.DEFAULT_RETRY_RESPONSE);
                }
            }

            function writeStatusReport() {

                try {

                    if (FULL_LOG === true) { logger.write("[INFO] start -> writeStatusReport -> Entering function."); }

                    let key = bot.devTeam + "-" + bot.codeName + "-" + bot.process + "-" + bot.dataSetVersion;

                    let statusReport = statusDependencies.statusReports.get(key);

                    statusReport.file.lastExecution = bot.processDatetime;

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
