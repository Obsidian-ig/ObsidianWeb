const axios = require("axios");

const registerUser = async (username, password, email) => {
  try {
    const response = await axios.post(
      "http://localhost:3000/api/users/register",
      {
        username,
        password,
        email,
      }
    );

    console.log(response.data);
  } catch (error) {
    console.error(error);
  }
};

registerUser("obsidianweb2", "somepassword", "test2@gmail.com");
