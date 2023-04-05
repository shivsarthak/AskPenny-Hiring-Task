import WebSocket from 'ws';
import { BINANCE_API_ENDPOINT, BINANCE_WS_ENDPOINT, CONSECUTIVE_RED_CANDLES, SUMMARY_TICKER } from '../config.js';
import sendEmail from './email.js';

export class CryptoBot {
    // Constructor function for the CryptoBot class
    // Parameters:
    // - tradingPair: string representing the trading pair to be monitored (e.g. 'BTCUSDT')
    // - interval: string representing the time interval of the candles (e.g. '1h', '4h')
    // - emailAddress: string representing the email address to which alerts will be sent
    constructor(tradingPair, interval, emailAddress) {
        this.tradingPair = tradingPair;
        this.interval = interval;
        this.emailAddress = emailAddress;
        this.sellThreshold = null;
        this.redCandleCount = 0;
        this.currentBuyPrice = null;
        this.transactions = [];
        this.dayTicker = SUMMARY_TICKER;
    }

    // Method to get historical candle data for the trading pair and interval
    // Parameters:
    // - tradingPair: string representing the trading pair to be monitored
    // - interval: string representing the time interval of the candles
    // Returns an array of objects representing the historical candle data
    async getHistoricCandleData(tradingPair, interval) {
        // Set the start and end times for the historical data (1 year)
        var endTime = new Date().getTime();
        var startTime = new Date().getTime() - 365 * 24 * 60 * 60 * 1000;
        var candles = [];
        // Get the historical data in batches of 1000 candles
        // and push the data to the candles array
        do {
            const url = `${BINANCE_API_ENDPOINT}?symbol=${tradingPair.toUpperCase()}&interval=${interval}&limit=1000&startTime=${startTime}`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.length === 0) {
                break;
            }
            candles.push(...data.map((candle) => {
                const [openTime, open, high, low, close, volume, closeTime] = candle;
                return {
                    openTime: new Date(openTime),
                    open: parseFloat(open),
                    high: parseFloat(high),
                    low: parseFloat(low),
                    close: parseFloat(close),
                    volume: parseFloat(volume),
                    closeTime: new Date(closeTime)
                }
            }))
            startTime = candles[candles.length - 1].closeTime.getTime();
        } while (startTime < endTime);
        return candles
    }


    // [TASK-2]

    // Calculates the sell threshold for the bot based on historic data ( 1 year )
    // Losses greater than the sell threshold indicate a sell signal indicating prices are about to go up
    // The sell threshold is the median of the percentage losses for all sequences of CONSECUTIVE_RED_CANDLES red candles
    // Parameters:
    // - historicData : Array of historical candlestick data
    // Returns the sell threshold percentage
    calculateSellThreshold(historicData) {
        var lossBucket = []
        let consecutiveLosses = 0;
        for (let i = 0; i < historicData.length; i++) {
            if (historicData[i].close < historicData[i].open) {
                consecutiveLosses++;
            }
            else {
                if (consecutiveLosses >= CONSECUTIVE_RED_CANDLES) {
                    var startIndex = i - consecutiveLosses
                    var endIndex = i - 1;
                    var percentLoss = ((historicData[startIndex].open - historicData[endIndex].close) / historicData[startIndex].open) * 100
                    lossBucket.push(percentLoss)
                }
                consecutiveLosses = 0;
            }
        }
        lossBucket.sort();
        if (lossBucket.length % 2 == 0) {
            var middleIndex = lossBucket.length / 2;
            var median = (lossBucket[middleIndex] + lossBucket[middleIndex + 1]) / 2
            return median;
        }
        else {
            var middleIndex = Math.floor(lossBucket.length / 2);
            return lossBucket[middleIndex];
        }
    }

    // Method to run the crypto bot
    // Gets the historical data for the trading pair and calculates the sell threshold percentage
    // Sets up the WebSocket connection to listen for real-time candle data
    async run() {
        try {
            const historicData = await this.getHistoricCandleData(this.tradingPair, this.interval);
            this.sellThreshold = this.calculateSellThreshold(historicData);
            console.log(`Sell Threshold set at ${this.sellThreshold}% to trigger sell signal after backtesting.`);
            this.setupWebSocket();
            console.log(`Crypto Bot monitoring prices for ${this.tradingPair.toUpperCase()}`);
            sendEmail(this.emailAddress, `Crypto Bot monitoring prices for ${this.tradingPair.toUpperCase()}`)
        } catch (err) {
            console.error('Error in running the crypto bot', err);
        }
    }

    // Method to set up the WebSocket connection to listen for real-time candle data
    // Subscribes to the WebSocket channel for the trading pair and interval
    // Binds the handleMessage method to the WebSocket's message event
    setupWebSocket() {
        const ws = new WebSocket(`${BINANCE_WS_ENDPOINT}/${this.tradingPair}@kline_${this.interval}`);
        ws.on('message', this.handleMessage.bind(this));
    }


    // [TASK-1]

    // This function handles the incoming data from the WebSocket
    // It takes in the data parameter which is in JSON format
    // The function first checks if the candle is closed, indicated by candle.x == true
    // If the candle is closed, it then checks if the candle is a red or green candle by comparing the open and close prices
    // If the candle is red, the redCandleCount is increased
    // If the candle is green, the redCandleCount is reset to zero
    // When the redCandleCount reaches a consecutive count of red candles as specified in the constant CONSECUTIVE_RED_CANDLES, 
    // the function triggers the handleBuySignal method
    // Additionally, if the current price is lower than the optimal sell threshold or greater than last buy price
    // the handleSellSignal method is triggered
    handleMessage(data) {
        const candle = JSON.parse(data);
        if (candle.x == true) {
            // DayTicker counts hours since the starting of the bot and sends a summary of transactions
            // After it sends the summary it resets the ticker to SUMMARY_TICKER value
            this.dayTicker = this.dayTicker - 1
            if (this.dayTicker == 0) {
                this.sendDailySummary();
                this.dayTicker = SUMMARY_TICKER;
            }
            if (candle.c < candle.o) {
                this.redCandleCount++;
            } else {
                this.redCandleCount = 0;
            }
            if (this.redCandleCount == CONSECUTIVE_RED_CANDLES) {
                this.redCandleCount = 0;
                this.handleBuySignal(candle);
            }
            if (this.currentBuyPrice && (candle.c <= (100 - this.sellThreshold) * this.currentBuyPrice / 100) || candle.c > this.currentBuyPrice) {
                this.handleSellSignal(candle);
            }
        }
    }

    // This function handles the buy signal
    // It takes in the candle parameter which contains the current candle data
    // The function first sets the buyPrice to the current candle's closing price
    // The currentBuyPrice is then updated to the buyPrice
    // A new transaction object with type, price, and timestamp is added to the transactions array
    // An email is sent to the emailAddress with the buy signal details
    handleBuySignal(candle) {
        const buyPrice = candle.c;
        this.currentBuyPrice = buyPrice;
        this.transactions.push({ type: 'buy', price: buyPrice, timestamp: new Date().getTime() });
        sendEmail(this.emailAddress, `Buy Signal Triggered for ${this.tradingPair} at ${buyPrice}`);
    }

    // This function handles the sell signal
    // It takes in the candle parameter which contains the current candle data
    // The function first sets the sellPrice to the current candle's closing price
    // The profitOrLoss is then calculated by subtracting the currentBuyPrice from the 
    // sellPrice and dividing the result by the currentBuyPrice, then multiplying by 100
    // A new transaction object with type, price, and timestamp is added to the transactions array
    // An email is sent to the emailAddress with the sell signal details, including the profit or loss percentage
    // The currentBuyPrice is then reset to null
    handleSellSignal(candle) {
        const sellPrice = candle.c;
        const profitOrLoss = (sellPrice - this.currentBuyPrice) / this.currentBuyPrice * 100;
        this.transactions.push({ type: 'sell', price: sellPrice, timestamp: new Date().getTime() });
        sendEmail(this.emailAddress, `Sell Signal Triggered for ${this.tradingPair} at ${sellPrice}. Profit/Loss: ${profitOrLoss}%`);
        this.currentBuyPrice = null;
    }

    // [TASK-3]

    // This is an asynchronous function that summarizes the transactions 
    // that have occurred on the current day, and sends an email with the summary.
    // It first filters the transactions to only include those that happened today by 
    // comparing the timestamp with today's date.
    sendDailySummary() {
        const transactionsToday = this.transactions.filter(transaction => {
            const transactionDate = new Date(transaction.timestamp);
            const todayDate = new Date();
            return (
                transactionDate.getFullYear() === todayDate.getFullYear() &&
                transactionDate.getMonth() === todayDate.getMonth() &&
                transactionDate.getDate() === todayDate.getDate()
            );
        });

        const summary = transactionsToday.reduce((summary, transaction) => {
            if (transaction.type === 'buy') {
                summary.totalBuys += 1;
                summary.totalBuyAmount += transaction.price;
            } else {
                summary.totalSells += 1;
                summary.totalSellAmount += transaction.price;
                const profitOrLoss = (transaction.price - this.currentBuyPrice) / this.currentBuyPrice * 100;
                summary.totalProfitOrLoss += profitOrLoss;
            }
            return summary;
        }, {
            totalBuys: 0,
            totalBuyAmount: 0,
            totalSells: 0,
            totalSellAmount: 0,
            totalProfitOrLoss: 0
        });
        const buyAveragePrice = summary.totalBuys > 0 ? summary.totalBuyAmount / summary.totalBuys : 0;
        const sellAveragePrice = summary.totalSells > 0 ? summary.totalSellAmount / summary.totalSells : 0;
        const averageProfitOrLoss = summary.totalSells > 0 ? summary.totalProfitOrLoss / summary.totalSells : 0;

        const message = `
            Trading Pair: ${this.tradingPair}
            Total Buys: ${summary.totalBuys}
            Total Sells: ${summary.totalSells}
            Buy Average Price: ${buyAveragePrice}
            Sell Average Price: ${sellAveragePrice}
            Average Profit/Loss: ${averageProfitOrLoss}%
        `;
        sendEmail(this.emailAddress, message);
    }
}
