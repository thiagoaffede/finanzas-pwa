import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const config = [...next, ...nextTs, { ignores: [".next/**", "drizzle/**", "public/sw.js"] }];
export default config;
