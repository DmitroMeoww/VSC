require("dotenv").config(); //.env
async function botlog(message) {
  fetch(
    `${process.env.botapi}/sendMessage?chat_id=${process.env.userid}&text=` +
      encodeURIComponent(message)
  );
}
botlog("dotenv, starting");
const express = require("express"); //Main
const app = express(); //Deploying Main
botlog("express");
const sqlite3 = require("sqlite3").verbose(); //Database
botlog("sqlite3");
const bcrypt = require("bcrypt"); //Passwords bcrypt
botlog("bcrypt");
const path = require("path"); //For .public
const port = process.env.PORT || 3000; //Port
const jwt = require("jsonwebtoken"); //Auth
botlog("jsonwebtoken");
const jwttoken = process.env.jwttoken; //Specical key
const cookieParser = require("cookie-parser"); //Give cookie
botlog("cookie-parser");
app.use(cookieParser()); // Use cookies
const jwtcookieopt = {
  httpOnly: true,
  secure: true,
  maxAge: 1000 * 60 * 60 * 24 * 3,
  sameSite: "Strict",
};
const updjwtcookieopt = {
  httpOnly: true,
  secure: true,
  maxAge: 1000 * 60 * 15,
  sameSite: "Strict",
};

// enabling logs because im not seeing them in the console

// Database setup
const database = new sqlite3.Database("./users.db", (err) => {
  if (err) {
    botlog("Database connection error: " + err.message);
  } else {
    botlog("Connected to the SQLite database.");
  }
});

database.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )
`);
database.run(`
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL
)
`);

// User functions DATABASE
async function getUser(username) {
  return new Promise((resolve, reject) => {
    database.get(
      "SELECT * FROM users WHERE username = ?",
      [username],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

async function addUser(username, password) {
  const hashedPassword = await bcrypt.hash(password, 10);
  return new Promise((resolve, reject) => {
    database.run(
      "INSERT INTO users (username, password) VALUES (?, ?)",
      [username, hashedPassword],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}
//User functions JSON WEB TOKEN

async function authenticate(token) {
  //Auth web token to data
  try {
    return jwt.verify(token, jwttoken);
  } catch (err) {
    return false;
  }
}

async function addsession(id, token) {
  //Adding session (upd jwt)
  return new Promise((resolve, reject) => {
    // Remove any existing session for the same id
    database.run("DELETE FROM sessions WHERE id = ?", [id], function (err) {
      if (err) return reject(err);
      // Insert the new session
      database.run(
        "INSERT INTO sessions (id, token) VALUES (?, ?)",
        [id, token],
        function (err) {
          if (err) return reject(err);
          resolve(true);
        }
      );
    });
  });
}

function CheckORUpdateJWT(req) {
  return new Promise((resolve, reject) => {
    const token = req.cookies.dmitromeowwebjwt;
    if (token) {
      authenticate(token).then((dcd) => {
        return resolve(dcd);
      });
    }
    const updatetoken = req.cookies.dmitromeowwebjwtupd;
    if (!updatetoken) return reject("No update token");
    const decoded = authenticate(updatetoken);
    if (!decoded) return reject("Token outdated");
    const userId = decoded.userId;
    database.get(
      "SELECT * FROM sessions WHERE id = ?",
      [userId],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return reject("Session not exists");
        const updjwt = jwt.sign({ userId }, jwttoken, { expiresIn: "3d" });
        const newjwt = jwt.sign({ userId }, jwttoken, { expiresIn: "15m" });
        database.run(
          "UPDATE sessions SET token = ? WHERE id = ?",
          [updjwt, userId],
          function (err) {
            if (err) return reject("Update session went wrong");
            resolve({ jwt: jwt, updjwt: updjwt });
          }
        );
      }
    );
  });
}
// Weather API
let weatherData = { current: {} };
let lastWeatherUpdate = 0;

async function fetchWeather() {
  try {
    if (Date.now() - lastWeatherUpdate < 180000) return true; // 3 minute cache

    const response = await fetch(process.env.weatherapi);
    if (!response.ok) throw new Error(`Weather API error: ${response.status}`);

    const data = await response.json();
    if (!data || !data.current) throw new Error("Invalid weather data");

    weatherData = data;
    lastWeatherUpdate = Date.now();
  } catch (error) {
    botlog("Error fetching weather data:", error);
  }
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.get("/", (req, res) => {
  CheckORUpdateJWT(req)
    .then((response) => {
      if (response.jwt && response.updjwt) {
        res.cookie("dmeow_access", response.jwt, jwtcookieopt);
        res.cookie("dmeow_upd", response.updjwt, updjwtcookieopt);
      }
      res.sendFile(path.join(__dirname, "public", "browser.html"));
    })
    .catch((why) => {
      res.redirect("/login");
    });
});

app.get("/account", (req, res) => {
  CheckORUpdateJWT(req)
    .then((response) => {
      if (response.jwt && response.updjwt) {
        res.cookie("dmeow_access", response.jwt, jwtcookieopt);
        res.cookie("dmeow_upd", response.updjwt, updjwtcookieopt);
      }
      res.sendFile(path.join(__dirname, "public", "account.html"));
    })
    .catch((why) => {
      res.redirect("/login");
    });
});

app.get("/signup", (req, res) => {
  CheckORUpdateJWT(req)
    .then((response) => {
      res.redirect("/account");
    })
    .catch((why) => {
      res.sendFile(path.join(__dirname, "public", "signup.html"));
    });
});

app.get("/login", (req, res) => {
  CheckORUpdateJWT(req)
    .then((response) => {
      res.redirect("/account");
    })
    .catch((why) => {
      res.sendFile(path.join(__dirname, "public", "login.html"));
    });
});

app.get("/weather", (req, res) => {
  fetchWeather().then(() => {
    res.send(weatherData.current);
  });
});

app.get("/token", (req, res) => {
  CheckORUpdateJWT(req)
    .then((response) => {
      if (response.jwt && response.updjwt) {
        res.cookie("dmeow_access", response.jwt, jwtcookieopt);
        res.cookie("dmeow_upd", response.updjwt, updjwtcookieopt);
      }
      res.send("TOKEN_ACTIVE");
    })
    .catch((why) => {
      res.send(why);
    });
});

app.post("/loginreq", async (req, res) => {
  botlog("Login request received");
  try {
    const { username, password } = req.body;

    if (!password) {
      return res.status(400).send("Password is required");
    }

    const user = await getUser(username);
    if (!user) {
      return res.status(404).send("User not found");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).send("Invalid password");
    }
    const userId = user.id;

    const token = jwt.sign({ userId }, jwttoken, { expiresIn: "15m" });
    const updatetoken = jwt.sign({ userId }, jwttoken, { expiresIn: "3d" });

    res.cookie("dmitromeowwebjwt", token, jwtcookieopt);
    res.cookie("dmitromeowwebjwtupd", updatetoken, updjwtcookieopt);
    await addsession(userId, updatetoken);
    res.status(200).send("Successfully logined up");
  } catch (err) {
    botlog("Login error:", err);
    res.status(500).send("Internal server error");
  }
});

app.post("/signupreq", async (req, res) => {
  botlog("Signup request received");
  try {
    const { username, password } = req.body;

    if (!username || typeof username !== "string") {
      return res.status(400).send("Invalid username");
    }
    if (!/^[a-zA-Z0-9]+$/.test(username)) {
      return res.status(400).send("Username must be alphanumeric");
    }
    if (!password || password.length < 8) {
      return res.status(400).send("Password must be 8+ chars");
    }
    const existingUser = await getUser(username);
    if (existingUser) {
      return res.status(409).send("Username already exists");
    }

    const userId = await addUser(username, password);

    const token = jwt.sign({ userId }, jwttoken, { expiresIn: "15m" });
    const updatetoken = jwt.sign({ userId }, jwttoken, { expiresIn: "3d" });
    res.cookie("dmitromeowwebjwt", token, jwtcookieopt);
    res.cookie("dmitromeowwebjwtupd", updatetoken, updjwtcookieopt);
    await addsession(userId, updatetoken);
    res.status(200).send("Successfully signed up");
  } catch (err) {
    botlog("Signup error:", err);
    res.status(500).send(err.message || "Internal server error");
  }
});

// Error handling
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
