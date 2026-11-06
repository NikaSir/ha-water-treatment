import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const shell = fs.readFileSync("templates/shell_v2/nikas-specialized-shell.js", "utf8");
for (const source of ["/dashboard-actions/home", "/dashboard-rooms-v11/rooms", "/dashboard-infrastructure/overview"]) {
 const storage = { getItem: () => source, setItem() {}, removeItem() {} };
 const window = { location: { origin: "https://ha.example", href: "https://ha.example/dashboard-test?return_to="+source+"&from="+source, search: "?return_to="+source+"&from="+source }, sessionStorage: storage, localStorage: storage };
 const context = vm.createContext({window, document: {referrer: "https://ha.example"+source}, URL, URLSearchParams, Date, console});
 vm.runInContext(shell, context);
 assert.equal(vm.runInContext('captureNikasShellReturnRoute({panelId:"water_treatment",parentRoute:"/home/overview",safeReturnRoute:"/home/overview"})', context), "/home/overview");
}
console.log("Header parent ignores opening source, query, storage, and referrer");
