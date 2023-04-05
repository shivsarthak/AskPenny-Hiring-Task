# AskPenny Hiring Task
Author: Shiv Sarthak Sabhlok

The AskPenny's Hiring Task was a project that involves building a crypto bot that can perform various trading activities. 

## Project Tasks:

### Task 1: Identify Buy Points [Done]

The bot is implemented to identify Buy Points from the live candle data fetched from Binance using websockets.
A buying point is defined as the point where the bot witnesses 5 consecutive red candles.
This is calculated in the `CryptoBot` class's `handleMessage` function in the `/src/cryptoBot.js` file.


### Task 2: Determine Optimal Sell Points [Done]

Using back testing of 1 year data, the bot finds the optimum sell percentage, which is the percentage of the dip that will happen till the point where the price is most likely to pick back up. 

The function groups *n* consecutive red candles seen in historic data (where n is set as the `CONSECUTIVE_RED_CANDLES` value in ``config.js`` file) and calculates the percentage dip. The `sellThreshold` is calculated as the mean of all the percentage dips.
This is calculated in the `CryptoBot` class's `calculateSellThreshold` function in the `/src/cryptoBot.js` file.

### Task 3: Calculate Profit and Loss [Done]

All sell and buy signals are stored as transactions. A ticker is decremented for every candle recorded and sends the summary on the email when the count reaches zero and the ticker is reset to the default value.

The ticker value is set as `SUMMARY_TICKER` value in the `config.js` file, which is 24. i.e. for every 24 candles the summary is sent. If the bot is run with `1h` candles, the summary will be sent every 24 hours.

## Running

To run the crypto bot project, follow these steps:

1. Clone the repository: 

```bash
git clone https://github.com/shivsarthak/askpenny-task.git
```
2. Install the dependencies: `npm install`
3. Set up the configuration: Create a `.env` file and add your nodemailer email and password as shown:

```
MAILER_EMAIL=<your_email>
MAILER_PASS=<your_password>
```

4. In the `main.js` file, a `CryptoBot` class is initialized, which takes 3 arguments:
- `tradingPair`: string value which denotes the pair of cryptocurrencies to monitor.
- `interval`: string value which denotes the interval of candles. e.g. `1s`, `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `1d`, `3d`, `1w`, `1M`.
- `emailAddress`: string value which will be the email at which the notification will be sent.
```js
const bot = new CryptoBot('ethusdt', '1h', 'shivsarthak34@gmail.com');
bot.run();
```
5. Run the project: 
```
npm run start
```
