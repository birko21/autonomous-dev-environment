import js from "@eslint/js";
import globals from "globals";

export default [
    js.configs.recommended,
    {
        ignores: ["node_modules/", "coverage/"]
    },
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest,
            }
        },
        rules: {
            "no-unused-vars": "warn"
        }
    }
];
