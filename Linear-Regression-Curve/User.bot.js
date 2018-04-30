﻿exports.newUserBot = function newUserBot(BOT, COMMONS, UTILITIES, DEBUG_MODULE, BLOB_STORAGE, STATUS_REPORT, POLONIEX_CLIENT_MODULE) {

    const FULL_LOG = true;
    const LOG_FILE_CONTENT = false;

    let bot = BOT;

    const GMT_SECONDS = ':00.000 GMT+0000';
    const GMT_MILI_SECONDS = '.000 GMT+0000';

    const MODULE_NAME = "User Bot";

    const EXCHANGE_NAME = "Poloniex";

    const TRADES_FOLDER_NAME = "Trades";

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

            gaussStorage.initialize({ bot: "AAGauss", devTeam: "AAMasters" }, onCharlyInizialized);

            function onCharlyInizialized(err) {

                if (err.result === global.DEFAULT_OK_RESPONSE.result) {

                    if (FULL_LOG === true) { logger.write("[INFO] initialize -> onCharlyInizialized -> Initialization Succeed."); }
                    callBackFunction(global.DEFAULT_OK_RESPONSE);

                } else {
                    logger.write("[ERROR] initialize -> onCharlyInizialized -> err = " + err.message);
                    callBackFunction(err);
                }
            }

        } catch (err) {
            logger.write("[ERROR] initialize -> err = " + err.message);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

/*

We are going to generate 2 files:

A. The first one will contain all the trades of the current minute and will be store in a folder that we will create for this if it does not exist.
This file will be incomplete, since we are at the current minute and some trades will happen after we retrieve the information from the exchange,
but this is not a problem, since the second file is going to fix this. This file is only usefull for viewing a partial candle as it is being built
at the head of the market.

B. The second file will contain all the trades of the previous minute. This will override the incomplete file written a minute before.

FILE FORMAT
-----------

Array of records with this information:

1. Trade Id provided by the exchange.
2. Trade Type: "buy" or "sell"
3. Trade Rate: the rate of the transaction.
4. Amount Asset A
5. Amount Asset B
6. Time: Seconds and Milliseconds the trade happened. (the rest of the time and date whoever reads the file already know it since it is organized in folders according to this.)

*/

    function start(callBackFunction) {

        try {

            if (FULL_LOG === true) { logger.write("[INFO] start -> Entering function."); }

            let market = global.MARKET;

            let currentDate;                // This will hold the current datetime of each execution.
            let previousMinute;             // This hold the current time minus 60 seconds.
            let marketQueue;                // This is the queue of all markets to be procesesd at each interval.

            let dateForPathA;
            let dateForPathB;

            let filePathA;
            let filePathB;

            let reportFilePath = EXCHANGE_NAME + "/Processes/" + bot.process;

            let exchangeCallTime;

            createFolders(); 

            function createFolders() {

                try {

                    if (FULL_LOG === true) { logger.write("[INFO] start -> createFolders -> Entering function."); }

                    currentDate = bot.processDatetime;
                    
                    previousMinute = new Date(currentDate.valueOf() - 60000);

                    dateForPathA = currentDate.getUTCFullYear() + '/' + utilities.pad(currentDate.getUTCMonth() + 1, 2) + '/' + utilities.pad(currentDate.getUTCDate(), 2) + '/' + utilities.pad(currentDate.getUTCHours(), 2) + '/' + utilities.pad(currentDate.getUTCMinutes(), 2);
                    dateForPathB = previousMinute.getUTCFullYear() + '/' + utilities.pad(previousMinute.getUTCMonth() + 1, 2) + '/' + utilities.pad(previousMinute.getUTCDate(), 2) + '/' + utilities.pad(previousMinute.getUTCHours(), 2) + '/' + utilities.pad(previousMinute.getUTCMinutes(), 2);

                    filePathA = bot.filePathRoot + "/Output/" + TRADES_FOLDER_NAME + '/' + dateForPathA;
                    filePathB = bot.filePathRoot + "/Output/" + TRADES_FOLDER_NAME + '/' + dateForPathB;

                    utilities.createFolderIfNeeded(filePathA, gaussStorage, onFolderACreated);

                    function onFolderACreated(err) {

                        if (FULL_LOG === true) { logger.write("[INFO] start -> createFolders -> onFolderACreated -> Entering function."); }

                        if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                            logger.write("[ERROR] start -> createFolders -> onFolderACreated -> err = " + err.message);
                            callBackFunction(err);
                            return;
                        }

                        utilities.createFolderIfNeeded(filePathB, gaussStorage, onFolderBCreated);
                    }

                    function onFolderBCreated(err) {

                        if (FULL_LOG === true) { logger.write("[INFO] start -> createFolders -> onFolderBCreated -> Entering function."); }

                        if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                            logger.write("[ERROR] start -> createFolders -> onFolderBCreated -> err = " + err.message);
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
                        getTheTrades(); 
                    }

                } catch (err) {
                    logger.write("[ERROR] start -> createFolders -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function getTheTrades() {

                try {

                    if (FULL_LOG === true) { logger.write("[INFO] start -> getTheTrades -> Entering function."); }

                    const datetime = parseInt(currentDate.valueOf() / 1000);

                    /*
                    We request to the Exchange API some more records than needed, anyway we will discard records out of the range we need.
                    To do this we substract 120 seconds and add 10 seconds to the already calculated current date.
                    */

                    const startTime = datetime - 120;
                    const endTime = datetime + 10;

                    exchangeCallTime = new Date();

                    poloniexApiClient.returnPublicTradeHistory(market.assetA, market.assetB, startTime, endTime, onExchangeCallReturned);

                } catch (err) {
                    logger.write("[ERROR] start -> getTheTrades -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function onExchangeCallReturned(err, exchangeResponse) {

                try {

                    if (FULL_LOG === true) { logger.write("[INFO] start -> onExchangeCallReturned -> Entering function."); }

                    if (FULL_LOG === true) {

                        let exchangeResponseTime = new Date();
                        let timeDifference = (exchangeResponseTime.valueOf() - exchangeCallTime.valueOf()) / 1000;
                        logger.write("[INFO] start -> onExchangeCallReturned -> Call time recorded = " + timeDifference + " seconds.");
                    }

                    poloniexApiClient.analizeResponse(logger, err, exchangeResponse, callBackFunction, onResponseOk);

                    function onResponseOk() {

                        tradesReadyToBeSaved(exchangeResponse);
                    }

                } catch (err) {
                    logger.write("[ERROR] start -> onExchangeCallReturned -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function tradesReadyToBeSaved(exchangeResponse) {

                try {

                    if (FULL_LOG === true) { logger.write("[INFO] start -> tradesReadyToBeSaved -> Entering function."); }

                    let fileRecordCounterA = 0;
                    let fileRecordCounterB = 0;

                    let fileNameA = '' + market.assetA + '_' + market.assetB + '.json';
                    let fileNameB = '' + market.assetA + '_' + market.assetB + '.json';

                    let needSeparator;
                    let separator;

                    needSeparator = false;

                    let fileContent = "";

                    /* First we create the file A */

                    fileContent = fileContent + '[';

                    for (i = 0; i < exchangeResponse.length; i++) {

                        let record = exchangeResponse[exchangeResponse.length - 1 - i]; // In Poloniex the order of the records is by date DESC so we change it to ASC

                        const trade = {
                            tradeIdAtExchange: record.tradeID,
                            marketIdAtExchange: record.globalTradeID,
                            type: record.type,
                            rate: record.rate,
                            amountA: record.total,
                            amountB: record.amount,
                            datetime: new Date(record.date + GMT_MILI_SECONDS)
                        };

                        trade.seconds = trade.datetime.getUTCSeconds();

                        if (trade.datetime.getUTCMinutes() === currentDate.getUTCMinutes()) {

                            if (needSeparator === false) {

                                needSeparator = true;
                                separator = '';

                            } else {
                                separator = ',';
                            }

                            fileContent = fileContent + separator + '[' + trade.tradeIdAtExchange + ',"' + trade.type + '",' + trade.rate + ',' + trade.amountA + ',' + trade.amountB + ',' + trade.seconds + ']';

                            fileRecordCounterA++;
                        }
                    }

                    fileContent = fileContent + ']';

                    gaussStorage.createTextFile(filePathA, fileNameA, fileContent + '\n', onFirstFileACreated);

                    function onFirstFileACreated(err) {

                        if (FULL_LOG === true) { logger.write("[INFO] start -> tradesReadyToBeSaved -> onFirstFileACreated -> Entering function."); }

                        if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                            logger.write("[ERROR] start -> tradesReadyToBeSaved -> onFirstFileACreated -> err = " + err.message);
                            callBackFunction(err);
                            return;
                        }

                        if (LOG_FILE_CONTENT === true) {
                            logger.write("[INFO] start -> writeFiles -> writeVolumes -> onFolderCreated -> onFileCreated ->  Content written = " + fileContent);
                        }

                        logger.write("[WARN] start -> tradesReadyToBeSaved -> onFirstFileACreated -> Finished with File A @ " + market.assetA + "_" + market.assetB + ", " + fileRecordCounterA + " records inserted into " + filePathA + "/" + fileNameA + ""); 

                        generateFileB();
                    }

                    function generateFileB() {

                        if (FULL_LOG === true) { logger.write("[INFO] start -> tradesReadyToBeSaved -> generateFileB -> Entering function."); }

                        fileContent = "";
                        needSeparator = false;

                        fileContent = fileContent + '[';

                        for (i = 0; i < exchangeResponse.length; i++) {

                            let record = exchangeResponse[exchangeResponse.length - 1 - i]; // In Poloniex the order of the records is by date DESC so we change it to ASC

                            const trade = {
                                tradeIdAtExchange: record.tradeID,
                                marketIdAtExchange: record.globalTradeID,
                                type: record.type,
                                rate: record.rate,
                                amountA: record.total,
                                amountB: record.amount,
                                datetime: new Date(record.date + GMT_MILI_SECONDS)
                            };

                            trade.seconds = trade.datetime.getUTCSeconds();

                            if (trade.datetime.getUTCMinutes() === previousMinute.getUTCMinutes()) {

                                if (needSeparator === false) {

                                    needSeparator = true;
                                    separator = '';

                                } else {
                                    separator = ',';
                                }

                                fileContent = fileContent + separator + '[' + trade.tradeIdAtExchange + ',"' + trade.type + '",' + trade.rate + ',' + trade.amountA + ',' + trade.amountB + ',' + trade.seconds + ']';

                                fileRecordCounterB++;
                            }
                        }

                        fileContent = fileContent + ']';

                        gaussStorage.createTextFile(filePathB, fileNameB, fileContent + '\n', onFileBCreated);

                        function onFileBCreated(err) {

                            if (FULL_LOG === true) { logger.write("[INFO] start -> tradesReadyToBeSaved -> onFileBCreated -> Entering function."); }

                            if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                                logger.write("[ERROR] start -> tradesReadyToBeSaved -> onFileBCreated -> err = " + err.message);
                                callBackFunction(err);
                                return;
                            }

                            if (LOG_FILE_CONTENT === true) {
                                logger.write("[INFO] start -> tradesReadyToBeSaved -> onFileBCreated ->  Content written = " + fileContent);
                            }

                            logger.write("[WARN] start -> tradesReadyToBeSaved -> onFileBCreated -> Finished with File B @ " + market.assetA + "_" + market.assetB + ", " + fileRecordCounterB + " records inserted into " + filePathB + "/" + fileNameB + ""); 

                            writeStatusReport();
                        }
                    }
                } catch (err) {
                    logger.write("[ERROR] start -> tradesReadyToBeSaved -> err = " + err.message);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function writeStatusReport() {

                try {

                    if (FULL_LOG === true) { logger.write("[INFO] start -> writeStatusReport -> Entering function."); }

                    let key = bot.devTeam + "-" + bot.codeName + "-" + bot.process + "-" + bot.dataSetVersion;

                    let statusReport = statusDependencies.statusReports.get(key);

                    statusReport.file = {
                        firstFile: {                                        // This date points to the file that might be incomplete.
                            year: currentDate.getUTCFullYear(),
                            month: (currentDate.getUTCMonth() + 1),
                            days: currentDate.getUTCDate(),
                            hours: currentDate.getUTCHours(),
                            minutes: currentDate.getUTCMinutes()
                        },
                        lastFile: {                                         // This will point to the last file written with is complete. That means it has all the trades in it.
                            year: previousMinute.getUTCFullYear(),
                            month: (previousMinute.getUTCMonth() + 1),
                            days: previousMinute.getUTCDate(),
                            hours: previousMinute.getUTCHours(),
                            minutes: previousMinute.getUTCMinutes()
                        }
                    };

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
