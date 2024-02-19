import dotenv from "dotenv";
import express from "express";
import { google } from "googleapis";

const calendar = google.calendar({
  version: "v3",
  auth: process.env.API_KEY,
});

dotenv.config({});
const app = express();

const PORT = process.env.PORT || 3000;

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

const scopes = ["https://www.googleapis.com/auth/calendar"];

app.get("/auth", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
  });
  res.redirect(url);
});

app.get("/google/redirect", async (req, res) => {
  const code = req.query.code;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  res.send("You are now logged in!");
});

// http://localhost:3000/busy_intervals/primary/2024-01-31T08:00:00Z/2024-02-02T17:00:00Z
app.get("/busy_intervals/:calendarId/:start/:end", async (req, res) => {
  const { calendarId, start, end } = req.params;
  const busyIntervals = await getBusyIntervals(calendarId, start, end);
  res.json(busyIntervals);
});

// http://localhost:3000/free_intervals/primary/2024-01-31T08:00:00Z/2024-02-02T23:00:00Z
app.get("/free_intervals/:calendarId/:start/:end", async (req, res) => {
  const { calendarId, start, end } = req.params;
  const freeIntervals = await getFreeIntervals(calendarId, start, end);
  res.json(freeIntervals);
});

async function getBusyIntervals(calendarId, start, end) {
  try {
    const busyIntervals = await calendar.freebusy.query({
      auth: oauth2Client,
      resource: {
        timeMin: start,
        timeMax: end,
        timeZone: "Asia/Colombo",
        items: [{ id: calendarId }],
      },
    });

    const busyTimes = busyIntervals.data.calendars[calendarId].busy || [];
    return busyTimes.map((busy) => ({
      start: busy.start,
      end: busy.end,
    }));
  } catch (error) {
    console.log("Couldn't get busy time intervals: ", error.message);
    throw error;
  }
}

async function getFreeIntervals(calendarId, start, end) {
  try {
    const busyIntervals = await getBusyIntervals(calendarId, start, end);
    const wholeRange = {
      start: convertToSriLankanTime(start),
      end: convertToSriLankanTime(end),
    };
    const freeIntervals = [];

    if (busyIntervals.length === 0) {
      freeIntervals.push(wholeDayFreeInterval[0]);
    }

    if (
      freeIntervals.length === 0 &&
      wholeRange.start !== busyIntervals[0].start
    ) {
      freeIntervals.push({
        start: wholeRange.start,
        end: busyIntervals[0].start,
      });
    }

    for (let i = 1; i < busyIntervals.length; i++) {
      const free = {
        start: busyIntervals[i - 1].end,
        end: busyIntervals[i].start,
      };

      freeIntervals.push(free);
    }

    if (wholeRange.end !== busyIntervals[busyIntervals.length - 1].end) {
      const free = {
        start: busyIntervals[busyIntervals.length - 1].end,
        end: wholeRange.end,
      };
      freeIntervals.push(free);
    }

    return freeIntervals;
  } catch (error) {
    console.log("Couldn't get free time intervals: ", error.message);
    throw error;
  }
}

function convertToSriLankanTime(dateTimeString) {
  const options = { timeZone: "Asia/Colombo" };
  const sriLankanDateTime = new Date(dateTimeString).toLocaleString(
    "en-US",
    options
  );
  return sriLankanDateTime;
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// References:
// https://developers.google.com/calendar/api/quickstart/nodejs
// https://developers.google.com/calendar/api/v3/reference/freebusy/query
// https://stackoverflow.com/questions/36475804/how-to-get-sri-lanka-time-abbreviation-from-date-function-in-javascript
