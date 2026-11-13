// Stampa l'SQL che inserisce (o aggiorna) nel database i pezzi da collezionare con la loro rarità.
// Da eseguire nel SQL Editor di Supabase dopo aver aggiunto pezzi al catalogo o cambiato rarità:
//   npm run avatar:sql
import { readFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync(new URL("../src/lib/avatar/catalog.json", import.meta.url), "utf8"));
const rarity = JSON.parse(readFileSync(new URL("../src/lib/avatar/rarity.json", import.meta.url), "utf8"));
const FREE = new Set(["hair"]);

const rows = catalog.items
  .filter((i) => !FREE.has(i.category))
  .map((i) => `  ('${i.id}', '${i.category}', '${rarity[i.id] ?? "comune"}')`);

console.log(`insert into public.avatar_items (id, category, rarity) values
${rows.join(",\n")}
on conflict (id) do update set category = excluded.category, rarity = excluded.rarity, active = true;

-- i pezzi tolti dal catalogo non escono più dalle bustine (chi li ha li tiene)
update public.avatar_items set active = false
  where id not in (${catalog.items.filter((i) => !FREE.has(i.category)).map((i) => `'${i.id}'`).join(", ")});`);
