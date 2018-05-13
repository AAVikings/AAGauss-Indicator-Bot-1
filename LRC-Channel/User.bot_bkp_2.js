var LRCIndicator = require('./LRCIndicator');
exports.newUserBot = function newUserBot(BOT, DEBUG_MODULE, COMMONS_MODULE) {
    let bot = BOT;

    const FULL_LOG = true;
    const MODULE_NAME = "User Bot";
    const LOG_INFO = true;
    const logger = DEBUG_MODULE.newDebugLog();
    logger.fileName = MODULE_NAME;
    logger.bot = bot;
    
    let thisObject = {
        initialize: initialize,
        start: start
    };

    let oliviaStorage = BLOB_STORAGE.newBlobStorage(bot);

    var fs = require('fs');

    let statusDependencies;

    return thisObject;

    function initialize(pStatusDependencies, pMonth, pYear, callBackFunction) {
        try {
            if (LOG_INFO === true) { logger.write("[INFO] initialize -> Entering function."); }

            logger.fileName = MODULE_NAME;
            statusDependencies = pStatusDependencies;
            commons.initializeStorage(oliviaStorage, onInitialized);

            function onInitialized(err) {
                if (err.result === global.DEFAULT_OK_RESPONSE.result) {
                    if (FULL_LOG === true) { logger.write("[INFO] initialize -> onInitialized -> Initialization Succeed."); }
                    callBackFunction(global.DEFAULT_OK_RESPONSE);
                } else {
                    logger.write("[ERROR] initialize -> onInitialized -> err = " + err.message);
                    callBackFunction(err);
                }
            }
        } catch (err) {
            logger.write("[ERROR] initialize -> onDone -> err = " + err.message);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function pad(str, max) {
        str = str.toString();
        return str.length < max ? pad("0" + str, max) : str;
    }

    function start(callBackFunction) {
        try {
            if (LOG_INFO === true) { logger.write("[INFO] start -> Entering function."); }

            /*

            This indicator read all the candles for the current day for Olivia until it gets at least 61 candles,
            if it couldn't get them on the first file will get the file from day before.

            */

            let contextVariables = {
                lastCandleFile: undefined,          // Datetime of the last file files sucessfully produced by this process.
                firstTradeFile: undefined,          // Datetime of the first trade file in the whole market history.
                maxCandleFile: undefined            // Datetime of the last file available to be used as an input of this process.
            };

            businessLogic(onDone);

            function onDone(err) {
                try {
                    switch (err.result) {                        
                        case global.DEFAULT_OK_RESPONSE.result: { 
                            logger.write("[INFO] start -> onDone -> Execution finished well. :-)");
                            callBackFunction(global.DEFAULT_OK_RESPONSE);
                            return;
                        }
                        case global.DEFAULT_RETRY_RESPONSE.result: {  // Something bad happened, but if we retry in a while it might go through the next time.
                            logger.write("[ERROR] start -> onDone -> Retry Later. Requesting Execution Retry.");
                            callBackFunction(global.DEFAULT_RETRY_RESPONSE);
                            return;
                        }
                        case global.DEFAULT_FAIL_RESPONSE.result: { // This is an unexpected exception that we do not know how to handle.
                            logger.write("[ERROR] start -> onDone -> Operation Failed. Aborting the process. err = " + err.message);
                            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                            return;
                        }
                    }
                } catch (err) {
                    logger.write("[ERROR] start -> onDone -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function businessLogic(callBack) {
                try {
                    if (LOG_INFO === true) { logger.write("[INFO] start -> businessLogic -> Entering function."); }

                    getChannelTilt(botDecision);

                    function botDecision(err, channelTilt) {
                        if (LOG_INFO === true) { logger.write("[INFO] start -> businessLogic -> botDecision  -> LRC Channel Tilt:" + channelTilt); }

                        if (err.result === global.DEFAULT_OK_RESPONSE.result) {
                            processBotDecision(channelTilt);
                        } else {
                            logger.write("[ERROR] start -> businessLogic -> err = " + err.message);
                            callBack(global.DEFAULT_FAIL_RESPONSE);
                        }
                    }

                    function processBotDecision(channelTilt) {

                        callBack(global.DEFAULT_OK_RESPONSE);
                    }
                } catch (err) {
                    logger.write("[ERROR] start -> businessLogic -> err = " + err.message);
                    callBack(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function getChannelTilt(callBack) {
                if (LOG_INFO === true) { logger.write("[INFO] start -> getChannelTilt -> Entering function."); }

                const CHANNEL_DOWN = -1;
                const CHANNEL_UP = 1;
                const NO_CHANNEL = 0;
                const maxLRCDepth = 62; // 61 to be able to calculate current lrc60, plus one to calculate previous lrc60
                const maxBackwardsCount = 60;

                let backwardsCount = 0;
                let candleArray = [];

                let queryDate = new Date(bot.processDatetime);
                let candleFile = getDailyFile(queryDate, onDailyFileReceived);

                function onDailyFileReceived(err, candleFile) {
                    if (LOG_INFO === true) { logger.write("[INFO] start -> getChannelTilt -> onDailyFileReceived." ); }

                    if (err.result === global.DEFAULT_OK_RESPONSE.result) {
                        for (let i = 0; i < candleFile.length; i++) {
                            let candle = {
                                open: undefined,
                                close: undefined,
                                min: 10000000000000,
                                max: 0,
                                begin: undefined,
                                end: undefined,
                                direction: undefined
                            };

                            candle.min = candleFile[i][0];
                            candle.max = candleFile[i][1];

                            candle.open = candleFile[i][2];
                            candle.close = candleFile[i][3];

                            candle.begin = candleFile[i][4];
                            candle.end = candleFile[i][5];

                            if (candle.open > candle.close) { candle.direction = 'down'; }
                            if (candle.open < candle.close) { candle.direction = 'up'; }
                            if (candle.open === candle.close) { candle.direction = 'side'; }

                            let timePeriod = candle.end - candle.begin + 1; // In miliseconds. (remember each candle spans a period minus one milisecond)
                            
                            if (candle.begin > bot.processDatetime.valueOf() - timePeriod * maxLRCDepth && candle.begin <= bot.processDatetime.valueOf()) {
                                candleArray.push(candleFile[i]);
                            }
                        }
                        
                        if (LOG_INFO === true) { logger.write("[INFO] start -> getChannelTilt -> Candle Array Length: " + candleArray.length); }

                        if (candleArray.length >= maxLRCDepth) {
                            if (LOG_INFO === true) { logger.write("[INFO] start -> getChannelTilt -> All candles available proceed with LRC calculations."); }

                            performLRCCalculations(callBack);
                        }else if (backwardsCount <= maxBackwardsCount) {
                            if (LOG_INFO === true) { logger.write("[INFO] start -> getChannelTilt -> Getting file for day before."); }

                            queryDate.setDate(queryDate.getDate() - 1);
                            getDailyFile(queryDate, onDailyFileReceived);
                            backwardsCount++;
                        } else {
                            logger.write("[ERROR] start -> getChannelTilt -> Not enough history to calculate LRC.");
                            callBack(global.DEFAULT_RETRY_RESPONSE);
                        }
                    }
                }

                function performLRCCalculations(callBack){
                    /*
                    * It's needed to order since it's possible that we need to get another file and it will put an older candle at the end of the array.
                    */
                    candleArray.sort(function (a, b) {
                        return a[4] - b[4];
                    });

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
                    

                    let channelTilt = NO_CHANNEL;
                    let ruleApplied = "";

                    if (lrc60 < lrc30 && lrc15 > lrc30 && lrc30 < lrc15) {
                        if (lrc15 > previousLrc15 && lrc30 > previousLrc30 && lrc60 > previousLrc60) {
                            channelTilt = CHANNEL_UP; // The channel points UP
                            ruleApplied += "Rule_1.";
                        }
                    }

                    if (lrc15 < lrc30 && lrc60 > lrc30 && lrc30 < lrc60) {
                        if (lrc15 < previousLrc15 && lrc30 < previousLrc30 && lrc60 < previousLrc60) {
                            channelTilt = CHANNEL_DOWN; // The channel points DOWN
                            ruleApplied += "Rule_2.";
                        }
                    }

                    if (lrc15 < previousLrc15 && lrc30 <= previousLrc30) {
                        // 15 AND 30 changed direction from up to down
                        channelTilt = CHANNEL_DOWN;
                        ruleApplied += "Rule_3a.";
                    }

                    if (lrc15 > previousLrc15 && lrc30 >= previousLrc30) {
                        // 15 AND 30 changed direction from down to up
                        channelTilt = CHANNEL_UP;
                        ruleApplied += "Rule_3b.";
                    }

                    let logMessage = bot.processDatetime.toISOString() + "\t" + ruleApplied + "\t" + channelTilt + "\t" + lrc15 + "\t" + lrc30 + "\t" + lrc60 ;
                    if (LOG_INFO === true) { logger.write("[INFO] start -> getChannelTilt -> performLRCCalculations -> Results: "+ logMessage); }
                    
                    fs.appendFile('./LRC_DATA.log', logMessage + "\n", function (err) {
                        if (err) throw err;
                        console.log(bot.processDatetime.toISOString() + ' - LRC Data Saved. ');
                    });

                    callBack(global.DEFAULT_OK_RESPONSE, channelTilt);
                }
            }

            function getDailyFile(dateTime, onDailyFileReceived) {
                try {
                    if (FULL_LOG === true) { logger.write("[INFO] start -> getChannelTilt -> getDailyFile -> Entering function."); }

                    //TODO Hardcoded parameters
                    let periodTime = 1800000;
                    let periodName = "30-min";

                    getFile(oliviaStorage, "@AssetA_@AssetB.json", "AAMasters/AAOlivia.1.0/AACloud.1.1/@Exchange/DataSet.V1/Output/Candles/Multi-Period-Daily/@Period/@Year/@Month/@Day", periodName, dateTime, onFileReceived, onDailyFileReceived);

                    function onFileReceived(err, localCandleFile) {
                        if (err.result === global.DEFAULT_OK_RESPONSE.result) {
                            onDailyFileReceived(global.DEFAULT_OK_RESPONSE, localCandleFile);
                        } else {
                            logger.write("[ERROR] start -> getChannelTilt -> getDailyFile -> onFileReceived -> Failed to get the file. Will abort the process and request a retry.");
                            callBackFunction(global.DEFAULT_RETRY_RESPONSE);
                            return;
                        }
                    }                    
                } catch (err) {
                    logger.write("[ERROR] start -> getChannelTilt -> getDailyFile -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function getFile(pFileStorage, pFileName, pFilePath, pPeriodName, pDatetime, innerCallBack, outerCallBack) {
                try {
                    pFileName = pFileName.replace("@AssetA", MARKET.assetA);
                    pFileName = pFileName.replace("@AssetB", MARKET.assetB);

                    pFilePath = pFilePath.replace("@Exchange", "Poloniex");
                    pFilePath = pFilePath.replace("@Period", pPeriodName);

                    if (pDatetime !== undefined) {
                        pFilePath = pFilePath.replace("@Year", pDatetime.getUTCFullYear());
                        pFilePath = pFilePath.replace("@Month", pad(pDatetime.getUTCMonth() + 1, 2));
                        pFilePath = pFilePath.replace("@Day", pad(pDatetime.getUTCDate(), 2));
                    }

                    if (FULL_LOG === true) { logger.write("[INFO] start -> getChannelTilt -> getCandleFile -> getFile -> final pFilePath = " + pFilePath); }
                    if (FULL_LOG === true) { logger.write("[INFO] start -> getChannelTilt -> getCandleFile -> getFile -> final pFileName = " + pFileName); }

                    pFileStorage.getTextFile(pFilePath, pFileName, onFileReceived);

                    function onFileReceived(err, text) {
                        if (FULL_LOG === true) { logger.write("[INFO] start -> getChannelTilt -> getCandleFile -> getFile -> onFileReceived -> pFilePath = " + pFilePath); }
                        if (FULL_LOG === true) { logger.write("[INFO] start -> getChannelTilt -> getCandleFile -> getFile -> onFileReceived -> pFileName = " + pFileName); }

                        if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                            logger.write("[ERROR] start -> getChannelTilt -> getFile -> onFileReceived -> err = " + err.message);
                            innerCallBack(err);
                            return;
                        }

                        try {
                            let data = JSON.parse(text);
                            innerCallBack(global.DEFAULT_OK_RESPONSE, data);
                        } catch (err) {
                            logger.write("[ERROR] start -> getChannelTilt ->  getCandleFile -> getFile -> onFileReceived -> Parsing JSON -> err = " + err.message);
                            innerCallBack(err);
                            return;
                        }
                    }
                } catch (err) {
                    logger.write("[ERROR] start -> getChannelTilt -> getCandleFile -> getFile -> err = " + err.message);
                    outerCallBack("Operation Failed");
                }
            }

            function calculateLRC(candlesArray) {
                if (LOG_INFO === true) { logger.write("[INFO] start -> getChannelTilt -> calculateLRC -> Entering function."); }
                
                let minimumChannelDepth = 15;
                let middleChannelDepth = 30;
                let maximumChannelDepth = 60;

                let lrcPoints = {
                    minimumChannelValue: 0,
                    middleChannelValue: 0,
                    maximumChannelValue: 0,
                    lrcTimeBegin: 0
                };

                let lrcMinIndicator = new LRCIndicator(minimumChannelDepth);
                let lrcMidIndicator = new LRCIndicator(middleChannelDepth);
                let lrcMaxIndicator = new LRCIndicator(maximumChannelDepth);
                let currentCandle = candlesArray[candlesArray.length - 1];

                for (let i = 0; i < candlesArray.length; i++) {
                    let tempCandle = candlesArray[i];
                    let averagePrice = (tempCandle[0] + tempCandle[1] + tempCandle[2] + tempCandle[3]) / 4; // TODO Check which price should be take to get the LRC
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
                    lrcPoints.lrcTimeBegin = currentCandle[4];

                    return lrcPoints;
                } else {
                    logger.write("[ERROR] start -> getChannelTilt -> calculateLRC -> There is not enough history to calculate the LRC.");
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }
        } catch (err) {
            logger.write("[ERROR] start -> err = " + err.message);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }
};
