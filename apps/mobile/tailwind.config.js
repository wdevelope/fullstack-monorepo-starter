/** @type {import('tailwindcss').Config} */
module.exports = {
  // 이 파일 기준 상대 경로라서, Metro를 어디서 시작하든 클래스 스캔이 동작한다.
  content: { relative: true, files: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"] },
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
};
