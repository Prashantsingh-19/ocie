import puppeteer from "puppeteer";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const HTML_PATH = path.resolve(__dirname, "../docs/mechanism.html");
const PDF_PATH = path.resolve(__dirname, "../docs/OCIE_Mechanism.pdf");

async function main() {
  console.log("Generating PDF...");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  const html = readFileSync(HTML_PATH, "utf-8");
  await page.setContent(html, { waitUntil: "load" });

  await page.pdf({
    path: PDF_PATH,
    format: "A4",
    margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div style='font-size:8px;color:#888;padding:10px 20mm 0;font-family:monospace;'>OCIE — Oncology Guidelines Intelligence Engine</div>",
    footerTemplate: "<div style='font-size:8px;color:#888;padding:0 20mm 10px;font-family:monospace;text-align:right;'>Page <span class='pageNumber'></span> of <span class='totalPages'></span></div>",
  });

  await browser.close();
  console.log(`PDF saved to ${PDF_PATH}`);
}

main().catch(console.error);
