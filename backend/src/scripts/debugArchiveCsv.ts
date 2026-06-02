import axios from "axios";

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      q = !q;
      continue;
    }
    if (!q && c === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

async function main() {
  const url = "https://raw.githubusercontent.com/ErKiran/kalimati/master/data/csv/2025/06/02.csv";
  const { data } = await axios.get<string>(url, { timeout: 30000 });
  const lines = data.split(/\r?\n/).filter((l) => l.trim());
  console.log("HEADER:", lines[0]);
  const header = parseCsvLine(lines[0]);
  header.forEach((h, i) => console.log(`  col[${i}]: ${h}`));

  for (const line of lines.slice(1)) {
    if (!/potato red/i.test(line)) continue;
    const cols = parseCsvLine(line);
    console.log("\nPotato Red row:");
    cols.forEach((c, i) => console.log(`  cols[${i}]: ${c}`));
    console.log("\nCURRENT MAPPING (bug?):");
    console.log("  max = cols[3] =", cols[3]);
    console.log("  min = cols[4] =", cols[4]);
    console.log("  avg = cols[5] =", cols[5]);
    break;
  }
}

main();
