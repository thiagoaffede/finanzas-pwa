import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

export default [...next, ...nextTs, { ignores: [".next/**", "drizzle/**", "public/sw.js"] }];
