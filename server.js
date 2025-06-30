const express = require("express");
const mongoose = require("mongoose");
const User = require("./User.js");
const Counter = require("./Counter.js");
const Sessions = require("./Sessions.js");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const cors = require("cors");
const ejs = require("ejs");


//google api shit://////////////////////////////////
const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");
// If modifying these scopes, delete token.json.
const SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.appfolder",
  "https://www.googleapis.com/auth/drive.file",
];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

let clientVar = null;

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    clientVar = client;
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  clientVar = client;
  return client;
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 */
async function listFiles(authClient) {
  const drive = google.drive({ version: "v3", auth: authClient });
  const res = await drive.files.list({
    pageSize: 10,
    fields: "nextPageToken, files(id, name)",
  });
  const files = res.data.files;
  if (files.length === 0) {
    console.log("No files found.");
    return;
  }

  console.log("Files:");
  files.map((file) => {
    console.log(`${file.name} (${file.id})`);
  });
}

async function createFolder(folderName, parentFolderId = null) {
  const drive = google.drive({ version: "v3", auth: clientVar });

  try {
    // Check for existing folder with the same name
    const existingFolders = await listFoldersByName(folderName, parentFolderId);

    if (existingFolders.length === 0) {
      console.log(`No folder named "${folderName}" found, creating folder...`);

      const folderMetadata = {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: parentFolderId ? [parentFolderId] : []
      };

      const folder = await drive.files.create({
        resource: folderMetadata,
        fields: "id"
      });

      console.log(`Folder created: ${folder.data.id}`);
      return folder.data.id;
    } else {
      console.log(`Folder named "${folderName}" already exists.`);
      return existingFolders[0].id; // Return the ID of the existing folder
    }
  } catch (error) {
    console.error(`Error creating folder: ${error}`);
    return null;
  }
}

async function getFolderById(folderId) {
  const drive = google.drive({ version: "v3", auth: clientVar });

  try {
    const res = await drive.files.get({
      fileId: folderId,
      fields: 'name, mimeType'
    });

    if (res.data.mimeType === 'application/vnd.google-apps.folder') {
      return res.data;
    } else {
      console.error('The provided ID does not belong to a folder.');
      return null;
    }
  } catch (error) {
    console.error('Error fetching folder:', error);
    return null;
  }
}

async function getFolderByName(folderName, parentFolderId = null) {
  const drive = google.drive({ version: "v3", auth: clientVar });

  try {
    let folderList = [];
    let pageToken = null;

    do {
      const res = await drive.files.list({
        q: parentFolderId
          ? `'${parentFolderId}' in parents`
          : `'root' in parents`,
        fields: "nextPageToken, files(id, name, mimeType)",
        pageToken: pageToken,
        pageSize: 100, // Adjust as needed
      });

      folderList = folderList.concat(
        res.data.files.filter(
          (file) =>
            file.mimeType === "application/vnd.google-apps.folder" &&
            file.name === folderName
        )
      );

      pageToken = res.data.nextPageToken;
    } while (pageToken);

    // Return the first match or null if not found
    return folderList[0] || null;
  } catch (error) {
    console.error("Error fetching folder by name:", error);
    return null;
  }
}


async function createFileInFolder(folderId, fileName, fileContent) {
  const drive = google.drive({ version: "v3", auth: clientVar });

  try {
    const fileMetadata = {
      name: fileName,
      mimeType: "text/plain",
      parents: [folderId]
    };

    const media = {
      mimeType: "text/plain",
      body: fileContent
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: "id"
    });

    console.log(`File created in folder: ${file.data.id}`);
    return file.data.id;
  } catch (error) {
    console.error(`Error creating file: ${error}`);
    return null;
  }
}

async function createWebsiteTemplateForUser(username) {
  const drive = google.drive({ version: 'v3', auth: clientVar });

  try {
    const parentFolderName = "ObsidianWebSites";
    const parentFolder = await getFolderByName(parentFolderName);

    if (!parentFolder) {
      console.error(`Parent folder "${parentFolderName}" not found.`);
      return false;
    }

    const userFolder = await createFolder(username, parentFolder.id);

    if (userFolder) {
      await createFileInFolder(userFolder, "index.html", "<!DOCTYPE html><html><head><title>Website Index</title></head><body><h1>This is the index.html of a user's website</h1></body></html>");
      await createFileInFolder(userFolder, "main.css", "");
      await createFileInFolder(userFolder, "main.js", "");
      console.log(`Website template created for user ${username}`);
      return true;
    } else {
      console.error(`Error creating user folder for ${username}`);
      return false;
    }
  } catch (error) {
    console.error(`Error creating website template: ${error.stack}`);
    return false;
  }
}

// Helper function to list folders by name
async function listFoldersByName(folderName, drive) {
  try {
    const sanitizedFolderName = folderName.replace(/'/g, "\\'");
    const res = await drive.files.list({
      q: `name = '${sanitizedFolderName}' and mimeType = 'application/vnd.google-apps.folder'`,
      fields: "files(id, name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    console.log("Folders found:", res.data.files);
    return res.data.files || [];
  } catch (error) {
    console.error("Error listing folders by name:", error.message, error.response?.data);
    return [];
  }
}

async function GetUserFileCount(username) {
  const drive = google.drive({ version: 'v3', auth: clientVar });
  try {
    const parentFolderName = "ObsidianWebSites";
    const parentFolder = await getFolderByName(parentFolderName);
    const userFolder = await getFolderByName(username, parentFolder.id);
    if (!userFolder) { 
      console.log(`Unable to find users folder for ${username}`);
      return 0;
    } 
    const res = await drive.files.list({ q: `'${userFolder.id}' in parents and trashed=false`, fields: 'files(id, name)', });
    const fileCount = res.data.files.length;
    return fileCount;
  } catch (e) {
    console.log(e); 
    return 0;
  }
}


async function GetUserFolderCount(username) {
  const drive = google.drive({ version: 'v3', auth: clientVar }); 
  try { 
    const parentFolderName = "ObsidianWebSites"; 
    const parentFolder = await getFolderByName(parentFolderName); 
    const userFolder = await getFolderByName(username, parentFolder.id); 
    if (!userFolder) { 
      console.log(`Unable to find users folder for ${username}`);
      return 0;
    } 
    const res = await drive.files.list({ q: `'${userFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id, name)', }); 
    const folderCount = res.data.files.length; 
    return folderCount; 
  } catch (e) {
    console.error(e); 
    return 0;
  }
}

async function GetUserTotalFileSize(username) { 
  const drive = google.drive({ version: 'v3', auth: clientVar }); 
  try { 
    const parentFolderName = "ObsidianWebSites"; 
    const parentFolder = await getFolderByName(parentFolderName); 
    const userFolder = await getFolderByName(username, parentFolder.id); 
    if (!userFolder) { 
      throw new Error(`User folder for ${username} not found.`); 
    } 
    const res = await drive.files.list({ q: `'${userFolder.id}' in parents and trashed=false`, fields: 'files(id, name, size)', }); 
    const files = res.data.files; 
    const totalSize = files.reduce((sum, file) => sum + (parseInt(file.size) || 0), 0); 
    return totalSize;
  } catch (e) {
    console.error(e);
    return 0;
  }
}


    authorize().catch(console.error);
    //////////////////////////////////////////////////////////////

    const app = express();
    app.use(cors());
    app.use(bodyParser.json());

    const uri =
      "mongodb+srv://obsidianig:Icycrowns283!@obsidianwebcluster.1ug7w.mongodb.net/?retryWrites=true&w=majority&appName=ObsidianWebCluster";

    async function connect() {
      try {
        await mongoose.connect(uri);
        console.log("Connected to MongoDB.");
        return;
      } catch (error) {
        console.error(error);
        return;
      }
    }

    async function disconnect() {
      try {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
      } catch (error) {
        console.error(error);
      }
    }

    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      const usernameHeader = req.headers.username;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log(authHeader + " : " + req.headers.authorization);
        return res.status(401).json({ message: "Unauthorized: Missing token" });
      }
      if (!usernameHeader) {
        return res.status(401).json({ message: "Unauthorized: Missing username" });
      }

      if (
        !mongoose.connection.readyState === 1 &&
        !mongoose.connection.readyState === 2
      ) {
        await connect();
      }

      const token = authHeader.split(" ")[1]; // Extract the token

      const user = await User.findOne({ name: usernameHeader });
      if (!user) {
        return res
          .status(401)
          .json({ message: "Unauthorized: Username does not exist." });
      }
      const userSession = await Sessions.findOne({ user: user._id });
      if (!userSession) {
        return res
          .status(401)
          .json({ message: "Unauthorized: Could not find user session." });
      }

      const validToken = userSession.tokens.includes(token);
      const isExpired = userSession.expiration < Date.now();

      if (validToken && !isExpired) {
        next(); // Allow access to the protected route
      } else {
        if (!validToken) {
          return res.status(403).json({ message: "Forbidden: Invalid token" });
        }
        if (isExpired && validToken) {
          return res.status(403).json({ message: "Your session has expired." });
        }
      }
    };

    // Apply the middleware to protected routes
    app.post("/protected-page", verifyToken, async (req, res) => {
      // Access user information from req.user (optional)
      res.json({ message: "Welcome to the protected page!" });
    });

    function formatSize(size) { 
      if (size < 1024) {
        return `${size}B`; 
      }
      else if (size < 1024 * 1024) {
         return `${(size / 1024).toFixed(2)}KB`; 
      }
      else if (size < 1024 * 1024 * 1024) {
         return `${(size / (1024 * 1024)).toFixed(2)}MB`;
      } 
      else {
        return `${(size / (1024 * 1024 * 1024)).toFixed(2)}GB`; 
      }
    }

    app.post("/api/users/dashboard", verifyToken, async (req, res) => {
      const username = req.headers.username;
      if (
        !mongoose.connection.readyState === 1 &&
        !mongoose.connection.readyState === 2
      ) {
        await connect();
      }
      const user = await User.findOne({ name: username });
      if (user) {
        const fileCount = await GetUserFileCount(username);
        const folderCount = await GetUserFolderCount(username);
        const totalSize = await GetUserTotalFileSize(username);
        const totalSizeConverted = formatSize(totalSize);
        const renderedTemplate = await ejs.renderFile('dashboard-template.ejs', { user }); // Render EJS template
        return res.status(200).json({ data: renderedTemplate });
      } else {
        return res
          .status(401)
          .json({ message: "Unauthorized: Unable to find user." });
      }
    });

    app.post("/api/users/login", async (req, res) => {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Missing required fields!" });
      }
      console.log(
        "User attempting to log in: " + req.body.username + ", " + req.body.password
      );
      if (
        !mongoose.connection.readyState === 1 &&
        !mongoose.connection.readyState === 2
      ) {
        await connect();
      }

      try {
        const userExists = await User.findOne({
          name: username,
        });
        if (userExists) {
          const passwordMatches = await bcrypt.compareSync(
            password,
            userExists.password
          );
          if (passwordMatches) {
            const sessionToken = await generateSessionToken(
              userExists.password,
              userExists.name
            ); // i just woke up, but I was working on this last. I don't really know what I was doing
            return res.status(200).json({ token: sessionToken });
          } else {
            return res
              .status(401)
              .json({ message: "Username or password is incorrect." });
          }
        } else {
          return res
            .status(401)
            .json({ message: "Username or password is incorrect." });
        }
      } catch (error) {
        console.error(error);
        return res
          .status(500)
          .json({ message: "Something went wrong internally :(" });
      }
    });

    async function generateSessionToken(userPass, userName) {
      const stringToHash = Date.now + userPass + Date.now().toString() + userName;
      const sessionToken = await bcrypt.hashSync(stringToHash, 10); // WAS WORKING ON THIS LAST< CREATING THE SESSION TOKEN
      if (
        !mongoose.connection.readyState === 1 &&
        !mongoose.connection.readyState === 2
      ) {
        await connect();
      }
      const user = await User.findOne({ name: userName });
      const sessionExists = await Sessions.findOne({ user: user._id });
      if (sessionExists) {
        sessionExists.tokens.push(sessionToken);
        await sessionExists.save();
        return sessionToken;
      } else {
        const newSession = await Sessions.create({ user: user._id });
        newSession.tokens.push(sessionToken);
        await newSession.save();
        return sessionToken;
      }
    }

    // user trys logging in using username + password
    // if password and username correct:
    //  check if session already exists
    //    if session exists: check if the current ip trying to login is in the ips array
    //      if ip is in the array of allowed ips: give it the corresponding session token
    //      if ip is not in the array of allowed ips: tell user to check their email for an email from ObsidianWeb! asking if they are the ones trying to log in
    //        if they validate they are the ones logging in: generate a new session token and add it to the tokens array. Also add the new ip to the ips array
    //          send the user the new token to be stored in local-storage
    //    if session does not exist:
    //      create a new session and gen a token, and add it to the tokens array. Then add the users ip address to the ips array.
    //        send the user the new token to be stored in local-storage

    app.post("/api/users/checkUsername", async (req, res) => {
      const { usernameToFind } = req.body;
      if (!usernameToFind) {
        return res.status(400).json({ message: "Missing required fields!" });
      }
      console.log("Searching for username: " + req.body);
      if (
        !mongoose.connection.readyState === 1 &&
        !mongoose.connection.readyState === 2
      ) {
        await connect();
      }
      try {
        const userExists = await User.findOne({ name: usernameToFind });
        if (userExists) {
          return res.status(412).json({ message: "Username already in use!" });
        } else {
          return res.status(200).json({ message: "Username is not in use :)" });
        }
      } catch (error) {
        console.error(error);
      } finally {
        //await disconnect();
      }
    });

    app.post("/api/users/register", async (req, res) => {
      const { username, password, email } = req.body;
      console.log(req.body);

      // Validate user input
      if (!username || !password || !email) {
        return res.status(400).json({ message: "Missing required fields!" });
      }

      if (
        !mongoose.connection.readyState === 1 &&
        !mongoose.connection.readyState === 2
      ) {
        await connect();
      }
      try {
        const existingUser = await User.findOne({ name: username });
        if (existingUser) {
          return res.status(409).json({ message: "Username already exists!" });
        }

        const hashedPassword = await bcrypt.hash(password, 10); // Hash password

        let userId = 176;

        const counterExists = await Counter.findOne({ _id: "userIdCounter" });
        if (counterExists) {
          try {
            console.log("Counter Exists!");
            const counter = await Counter.findOneAndUpdate(
              { _id: "userIdCounter" },
              { $inc: { seq: 1 } },
              { new: true }
            );

            userId = counter.seq.valueOf();
          } catch (error) {
            console.error(error.message);
          }
        } else {
          try {
            await Counter.create({ seq: 0 });
            console.log("Created Counter.");
            const counter = await Counter.findOneAndUpdate(
              {},
              { $inc: { seq: 1 } },
              { new: true }
            );

            userId = counter.seq.valueOf();
          } catch (error) {
            console.error(error.message);
          }
        }

        const user = await User.create({
          name: username,
          password: hashedPassword,
          email: email,
          id: userId,
          createdAt: Date.now(),
        });

        console.log(`User created: ${user.name}`);
        const templateCreated = await createWebsiteTemplateForUser(user.name);
        if (templateCreated) {
          return res.status(200).json({ message: "User created successfully!" });
        } else {
          return res.status(500).json({ message: "Error creating the users website!" });
        }
      } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: "Internal server error" });
      } finally {
        //await disconnect();
      }
    });

    process.on("exit", async (code) => {
      console.log("Disconnecting from MongoDB");
      await disconnect();
    });

    app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
      );
      next();
    });

    app.listen(3000, async () => {
      console.log("Server is listening on port: 3000");
      console.log("Connecting to MongoDB.");
      await connect();
    });
