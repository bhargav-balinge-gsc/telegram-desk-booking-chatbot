const TelegramBot = require("node-telegram-bot-api");
const mysql = require("mysql2");
const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config();

// Telegram Bot Setup
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// MySQL Database Setup
const db = mysql.createConnection({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
    return;
  }
  console.log("Connected to MySQL database.");
});

// Express Server for Dialogflow
const app = express();
app.use(bodyParser.json());

// Telegram Bot Logic
const userSessions = {}; // Store user responses temporarily

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!userSessions[chatId]) {
    userSessions[chatId] = { step: 0, data: {} };
    bot.sendMessage(
      chatId,
      "Where do you want to book the seat (Pune/Bangalore)?"
    );
    return;
  }

  const session = userSessions[chatId];
  switch (session.step) {
    case 0:
      session.data.location = text; // Store the location (Pune/Bangalore)
      session.step++;
      bot.sendMessage(chatId, "What is the booking date (yyyy-mm-dd)?");
      break;
    case 1:
      session.data.booking_date = text; // Store the booking date
      session.step++;
      bot.sendMessage(chatId, "Which seat do you want to select?");
      break;
    case 2:
      session.data.seat = text; // Store the seat selection

      // Save to database
      db.query(
        "INSERT INTO bookings (location, booking_date, seat) VALUES (?, ?, ?)",
        [session.data.location, session.data.booking_date, session.data.seat],
        (err) => {
          if (err) {
            bot.sendMessage(
              chatId,
              "There was an error saving your booking. Please try again."
            );
            console.error(err);
          } else {
            bot.sendMessage(chatId, "Thank you! Your booking has been saved.");
          }
        }
      );

      // Reset session
      delete userSessions[chatId];
      break;
    default:
      bot.sendMessage(chatId, "Something went wrong. Let's start over.");
      delete userSessions[chatId];
      break;
  }
});

// Dialogflow Webhook Endpoint
app.post("/webhook", (req, res) => {
  const intent = req.body.queryResult.intent.displayName;
  const parameters = req.body.queryResult.parameters;

  if (intent === "BookSeat") {
    const { location, booking_date, seat_no } = parameters;

    // Save to database
    db.query(
      "INSERT INTO bookings (location, booking_date, seat_no) VALUES (?, ?, ?)",
      [location, booking_date, seat_no],
      (err) => {
        if (err) {
          console.error("Error saving booking:", err);
          res.send({
            fulfillmentText: "There was an error saving your booking.",
          });
        } else {
          res.send({
            fulfillmentText: `Thank you! Your booking at ${location} has been saved.`,
          });
        }
      }
    );
  } else {
    res.send({ fulfillmentText: "I didn't understand your request." });
  }
});

// Start Express Server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
