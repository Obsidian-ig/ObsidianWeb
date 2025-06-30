const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const port = 3000;

const rootDir = __dirname;
const websitesDir = path.join(rootDir, "websites");

// Middleware to handle requests and log access
app.use((req, res, next) => {
  const host = req.headers.host.split(":")[0]; // Extract the host without the port
  const subdomain = host.split(".")[0]; // Extract the subdomain (e.g., subdomain.localhost)

  if (host === "localhost") {
    console.log(`Accessing base domain: ${host}`);
    return res.sendFile(path.join(rootDir, "index.html"));
  } else if (subdomain !== "localhost") {
    console.log(`Accessing subdomain: ${subdomain}`);
    const subdomainDir = path.join(websitesDir, subdomain);

    if (fs.existsSync(subdomainDir)) {
      const indexPath = path.join(subdomainDir, "index.html");
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
    }
    console.log(`Subdomain not found: ${subdomain}`);
    return res.sendFile(path.join(rootDir, "not_found.html"));
  }

  next();
});

// Serve static files (e.g., CSS, JS, images)
app.use(express.static(rootDir));

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
