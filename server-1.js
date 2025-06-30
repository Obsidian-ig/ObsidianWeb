const express = require("express");
const mongoose = require("mongoose");
const User = require("./User.js");

const app = express();

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

async function CreateUser(userName, id, password, email) {
  await connect();
  try {
    if (await User.findOne({ name: userName })) {
      console.log("Cannot create user! User already exists!");
      return;
    }

    const user = await User.create({
      name: userName,
      id: id,
      password: password,
      email: email,
    });
    console.log("User created.");
  } catch (e) {
    console.log(e.message);
  }
}
CreateUser("obsidianweb");

app.listen(3000, () => {
  console.log("Server is listening on port: 3000");
});
