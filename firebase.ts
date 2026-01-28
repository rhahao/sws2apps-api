import { writeFileSync } from "node:fs";

const config = {
  emulators: {
    auth: {
      host: "0.0.0.0",
      port: parseInt(process.env.FIREBASE_AUTH_PORT || '9099')
    },
    ui: {
      enabled: false,
    },
    singleProjectMode: true
  }
};

writeFileSync('firebase.json', JSON.stringify(config, null, 2));