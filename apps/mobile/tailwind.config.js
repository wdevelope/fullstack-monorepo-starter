/** @type {import('tailwindcss').Config} */
module.exports = {
  // Relative to this file, so the class scan works no matter where Metro was started.
  content: { relative: true, files: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"] },
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
};
