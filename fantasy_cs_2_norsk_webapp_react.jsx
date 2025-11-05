import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { BarChart3, Shield, Users, Trophy, Settings, Info, X } from "lucide-react";

/**
 * FULL APP (oppdatert):
 * - Admin-fane krever passord (innholdet er bak login, fanen kan være synlig men innhold skjermes).
 * - Fjernet «Nullstill deltakarar» fra brukersida (for å hindre uhell). Sletting kan gjøres i Admin nederst.
 * - Bonus støtter N ganger per lag (f.eks. 2x «Spelar skadet»). UI viser chips med teller og knapper for +/-.
 * - Fikset X-knappen (fjern én bonus-forekomst). 
 * - Dynamiske grunnreglar => nye kolonnar (extra) i resultat-tabellen.
 * - Hvit hovedtittel på mørk bakgrunn.
 */

// --- Data ---
const STAGE1 = [
  "FaZe Clan","GamerLegion","Ninjas in Pyjamas","B8","PARIVISION","Fnatic","Legacy","Imperial",
  "M80","NRG","Fluxo","RED Canids","Lynn Vision","The Huns","FlyQuest","Rare Atom",
];
const STAGE2 = [
  "Aurora","Natus Vincere","Astralis","3DMAX","Team Liquid","MIBR","Passion UA","TYLOO",
];
const STAGE3 = [
  "Team Vitality","Team Spirit","Team Falcons","MOUZ","G2 Esports","FURIA","paiN Gaming","The MongolZ",
];

const DEFAULT_GRUNNREGLAR = [
  { key: "win", label: "Lag vinn ein kamp", value: 3 },
  { key: "loss", label: "Lag taper ein kamp", value: 0 },
  { key: "next", label: "Lag går vidare til neste stage", value: 5 },
  { key: "sweepW", label: "Lag vinn 2–0 (sweep)", value: 2 },
  { key: "sweepL", label: "Lag taper 0–2 (sweep)", value: -2 },
  { key: "playoff", label: "Lag kjem til playoff", value: 5 },
  { key: "semi", label: "Lag kjem til semifinale", value: 3 },
  { key: "final", label: "Lag kjem til finale", value: 5 },
  { key: "champ", label: "Lag vinn Majoren", value: 10 },
];
const DEFAULT_BONUSREGLAR = [
  { key: "underdogTop5", label: "Underdog-seier mot topp 5", value: 2 },
  { key: "overtime", label: "Overtime-kamp", value: 1 },
  { key: "allThreeSemi", label: "Alle tre lag i semifinalen (spelar)", value: 5 },
  { key: "perfectRun", label: "Perfekt run (ingen tap)", value: 3 },
  { key: "injury", label: "Spelar skadet", value: -3 },
];

const ALL_TEAMS = [...STAGE1, ...STAGE2, ...STAGE3];
const STAGE_BY_TEAM = Object.fromEntries([
  ...STAGE1.map(t => [t, "Stage 1"]),
  ...STAGE2.map(t => [t, "Stage 2"]),
  ...STAGE3.map(t => [t, "Stage 3"]),
]);

// --- Types (JSDoc for intellisense) ---
/** @typedef {{
 *  team:string; wins:number; losses:number; sweepsW:number; sweepsL:number;
 *  next:number; playoff:number; semi:number; final:number; champ:number;
 *  bonusCounts: Record<string, number>; // label -> count
 *  extra?: Record<string, number>; // dynamiske grunnreglar (label -> count)
 * }} TeamResult */

/** @typedef {{ name:string; s1?:string; s2?:string; s3?:string }} PlayerPick */

/** @typedef {{ grunn:{key:string,label:string,value:number}[]; bonus:{key:string,label:string,value:number}[]; bonusActive:boolean }} RulesState */

// --- Helpers ---
const LS_KEYS = {
  rules: "fantasy_cs2_rules_v1",
  results: "fantasy_cs2_results_v2", // bump versjon pga ny bonusstruktur
  players: "fantasy_cs2_players_v1",
  admin: "fantasy_cs2_admin_ok_v1",
};

/** @returns {RulesState} */
function loadRules(){
  const raw = localStorage.getItem(LS_KEYS.rules);
  if (!raw) return { grunn: DEFAULT_GRUNNREGLAR, bonus: DEFAULT_BONUSREGLAR, bonusActive: true };
  try { return JSON.parse(raw); } catch { return { grunn: DEFAULT_GRUNNREGLAR, bonus: DEFAULT_BONUSREGLAR, bonusActive: true }; }
}
function saveRules(r){ localStorage.setItem(LS_KEYS.rules, JSON.stringify(r)); }

/** @returns {TeamResult[]} */
function loadResults(){
  // Prøv v2 først
  const rawV2 = localStorage.getItem(LS_KEYS.results);
  if (rawV2){ try { const arr = JSON.parse(rawV2); return arr.map(migrateResultRow); } catch {}
  }
  // Fall back: migrer fra gammel v1 (bonusPicked-array) dersom finnes
  const rawV1 = localStorage.getItem("fantasy_cs2_results_v1");
  if (rawV1){
    try {
      const rows = JSON.parse(rawV1);
      /** @type {TeamResult[]} */
      const migrated = rows.map(r => ({
        team: r.team,
        wins: r.wins||0, losses: r.losses||0, sweepsW: r.sweepsW||0, sweepsL: r.sweepsL||0,
        next: r.next||0, playoff: r.playoff||0, semi: r.semi||0, final: r.final||0, champ: r.champ||0,
        extra: r.extra||{},
        bonusCounts: Object.fromEntries((r.bonusPicked||[]).map(lbl => [lbl, 1])),
      }));
      saveResults(migrated);
      return migrated.map(migrateResultRow);
    } catch {}
  }
  // Ny init
  return ALL_TEAMS.map(team => ({
    team, wins:0, losses:0, sweepsW:0, sweepsL:0, next:0, playoff:0, semi:0, final:0, champ:0,
    bonusCounts: {}, extra: {},
  }));
}
/** @param {TeamResult} r */
function migrateResultRow(r){
  return {
    team: r.team,
    wins: r.wins||0, losses: r.losses||0, sweepsW: r.sweepsW||0, sweepsL: r.sweepsL||0,
    next: r.next||0, playoff: r.playoff||0, semi: r.semi||0, final: r.final||0, champ: r.champ||0,
    extra: r.extra||{},
    bonusCounts: r.bonusCounts || {},
  };
}
/** @param {TeamResult[]} rows */
function saveResults(rows){ localStorage.setItem(LS_KEYS.results, JSON.stringify(rows)); }

/** @returns {PlayerPick[]} */
function loadPlayers(){
  const raw = localStorage.getItem(LS_KEYS.players);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
function savePlayers(ps){ localStorage.setItem(LS_KEYS.players, JSON.stringify(ps)); }

const BASE_LABELS = new Set([
  "Lag vinn ein kamp",
  "Lag taper ein kamp",
  "Lag vinn 2–0 (sweep)",
  "Lag taper 0–2 (sweep)",
  "Lag går vidare til neste stage",
  "Lag kjem til playoff",
  "Lag kjem til semifinale",
  "Lag kjem til finale",
  "Lag vinn Majoren",
]);

/** @param {TeamResult} tr @param {RulesState} rules */
function calcTeamPoints(tr, rules){
  const R = Object.fromEntries(rules.grunn.map(g => [g.label, g.value]));
  let total = 0;
  total += tr.wins * (R["Lag vinn ein kamp"] ?? 0);
  total += tr.losses * (R["Lag taper ein kamp"] ?? 0);
  total += tr.sweepsW * (R["Lag vinn 2–0 (sweep)"] ?? 0);
  total += tr.sweepsL * (R["Lag taper 0–2 (sweep)"] ?? 0);
  total += tr.next * (R["Lag går vidare til neste stage"] ?? 0);
  total += tr.playoff * (R["Lag kjem til playoff"] ?? 0);
  total += tr.semi * (R["Lag kjem til semifinale"] ?? 0);
  total += tr.final * (R["Lag kjem til finale"] ?? 0);
  total += tr.champ * (R["Lag vinn Majoren"] ?? 0);
  // dynamiske ekstra-reglar
  const extra = tr.extra || {};
  for (const g of rules.grunn){
    if (!BASE_LABELS.has(g.label)){
      const n = extra[g.label] || 0;
      total += n * (g.value || 0);
    }
  }
  // bonus (med counts)
  if (rules.bonusActive && tr.bonusCounts){
    const RB = Object.fromEntries(rules.bonus.map(b => [b.label, b.value]));
    for (const [lbl, n] of Object.entries(tr.bonusCounts)){
      total += (RB[lbl] ?? 0) * (n||0);
    }
  }
  return total;
}

/** @param {PlayerPick} p @param {TeamResult[]} results @param {RulesState} rules */
function calcPlayerTotal(p, results, rules){
  const ids = [p.s1, p.s2, p.s3].filter(Boolean);
  return ids.reduce((acc, team) => acc + calcTeamPoints(results.find(r=>r.team===team), rules), 0);
}

// --- UI atoms ---
function Section({title, icon, children}){
  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center gap-2">
        {icon}
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// --- Admin panel ---
function Admin({rules, setRules, results, setResults, players, setPlayers}){
  const [pwdOk, setPwdOk] = useState(() => localStorage.getItem(LS_KEYS.admin)==="true");
  const [pwd, setPwd] = useState("");

  function handleLogin(){
    if (pwd === "admin123") { setPwdOk(true); localStorage.setItem(LS_KEYS.admin, "true"); toast.success("Admin pålogget"); }
    else toast.error("Feil passord");
  }
  function logout(){ setPwdOk(false); localStorage.removeItem(LS_KEYS.admin); }

  if (!pwdOk) {
    return (
      <Section title="Admin innlogging" icon={<Shield className="h-5 w-5"/>}>
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <div className="sm:col-span-2">
            <Label htmlFor="pwd">Admin-passord</Label>
            <Input id="pwd" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="skriv passord…" />
          </div>
          <Button onClick={handleLogin}>Logg inn</Button>
        </div>
      </Section>
    );
  }

  // --- Reglar CRUD ---
  function updateGrunn(i, field, v){
    const next = {...rules, grunn: rules.grunn.map((g,idx)=> idx===i ? {...g, [field]: field==="value"? Number(v): v} : g)};
    setRules(next); saveRules(next);
  }
  function addGrunn(){ const next = {...rules, grunn:[...rules.grunn, {key:crypto.randomUUID(), label:"Ny regel", value:0}]}; setRules(next); saveRules(next); }
  function delGrunn(i){ const next = {...rules, grunn: rules.grunn.filter((_,idx)=>idx!==i)}; setRules(next); saveRules(next); }

  function updateBonus(i, field, v){
    const next = {...rules, bonus: rules.bonus.map((g,idx)=> idx===i ? {...g, [field]: field==="value"? Number(v): v} : g)};
    setRules(next); saveRules(next);
  }
  function addBonus(){ const next = {...rules, bonus:[...rules.bonus, {key:crypto.randomUUID(), label:"Ny bonus", value:0}]}; setRules(next); saveRules(next); }
  function delBonus(i){ const next = {...rules, bonus: rules.bonus.filter((_,idx)=>idx!==i)}; setRules(next); saveRules(next); }

  // --- Resultat CRUD ---
  function updateResult(team, patch){
    const next = results.map(r=> r.team===team ? {...r, ...patch} : r);
    setResults(next); saveResults(next);
  }
  function updateResultExtra(team, label, value){
    const next = results.map(r=> {
      if (r.team!==team) return r;
      const extra = { ...(r.extra||{}) };
      if (!Number.isFinite(value) || value<=0) delete extra[label]; else extra[label] = value;
      return { ...r, extra };
    });
    setResults(next); saveResults(next);
  }
  function addBonusCount(team, label){
    const next = results.map(r=> {
      if (r.team!==team) return r;
      const bc = { ...(r.bonusCounts||{}) };
      bc[label] = (bc[label]||0) + 1;
      return { ...r, bonusCounts: bc };
    });
    setResults(next); saveResults(next);
  }
  function removeBonusOnce(team, label){
    const next = results.map(r=> {
      if (r.team!==team) return r;
      const bc = { ...(r.bonusCounts||{}) };
      const n = (bc[label]||0) - 1;
      if (n<=0) delete bc[label]; else bc[label] = n;
      return { ...r, bonusCounts: bc };
    });
    setResults(next); saveResults(next);
  }

  const extraGrund = rules.grunn.filter(g=> !BASE_LABELS.has(g.label));

  // --- Slett deltakar ---
  function deletePlayer(name){
    const next = players.filter(p=> p.name !== name);
    setPlayers(next); savePlayers(next);
    toast.success(`Sletta ${name}`);
  }

  return (
    <div className="space-y-6">
      <Section title="Reglar" icon={<Settings className="h-5 w-5"/>}>
        <div className="flex items-center gap-3 mb-4">
          <Switch checked={rules.bonusActive} onCheckedChange={(v)=>{ const next={...rules, bonusActive: !!v}; setRules(next); saveRules(next); }} />
          <span className="text-sm">Bonus aktiv?</span>
          <div className="ml-auto"><Button variant="outline" onClick={()=>{saveRules({grunn:DEFAULT_GRUNNREGLAR, bonus:DEFAULT_BONUSREGLAR, bonusActive:true}); toast.success("Reglar tilbakestilt");}}>Tilbakestill</Button></div>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <h4 className="font-semibold mb-2">Grunnreglar</h4>
            <div className="space-y-2">
              {rules.grunn.map((g, i)=> (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-8" value={g.label} onChange={e=>updateGrunn(i, "label", e.target.value)} />
                  <Input className="col-span-3" type="number" value={g.value} onChange={e=>updateGrunn(i, "value", e.target.value)} />
                  <Button variant="ghost" className="col-span-1" onClick={()=>delGrunn(i)}>✕</Button>
                </div>
              ))}
              <Button variant="secondary" onClick={addGrunn}>+ Legg til regel</Button>
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Bonusreglar</h4>
            <div className="space-y-2">
              {rules.bonus.map((g, i)=> (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-8" value={g.label} onChange={e=>updateBonus(i, "label", e.target.value)} />
                  <Input className="col-span-3" type="number" value={g.value} onChange={e=>updateBonus(i, "value", e.target.value)} />
                  <Button variant="ghost" className="col-span-1" onClick={()=>delBonus(i)}>✕</Button>
                </div>
              ))}
              <Button variant="secondary" onClick={addBonus}>+ Legg til bonus</Button>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Resultat pr lag" icon={<Trophy className="h-5 w-5"/>}>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lag</TableHead><TableHead>Stage</TableHead>
                <TableHead>K.vunne</TableHead><TableHead>K.tapt</TableHead>
                <TableHead>2–0</TableHead><TableHead>0–2</TableHead>
                <TableHead>Vidare</TableHead><TableHead>Playoff</TableHead>
                <TableHead>Semi</TableHead><TableHead>Finale</TableHead><TableHead>Vinnar</TableHead>
                {extraGrund.map(g=> (<TableHead key={g.label}>{g.label}</TableHead>))}
                <TableHead>Bonusar</TableHead><TableHead>Poeng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map(r=> {
                const stage = STAGE_BY_TEAM[r.team];
                const teamPoints = calcTeamPoints(r, rules);
                const bonusTotalCount = Object.values(r.bonusCounts||{}).reduce((a,b)=>a+(b||0),0);
                return (
                  <TableRow key={r.team} className="hover:bg-muted/40">
                    <TableCell className="font-medium">{r.team}</TableCell>
                    <TableCell>{stage}</TableCell>
                    <TableCell><Input type="number" className="w-20" value={r.wins} onChange={e=>updateResult(r.team,{wins:Number(e.target.value)})}/></TableCell>
                    <TableCell><Input type="number" className="w-20" value={r.losses} onChange={e=>updateResult(r.team,{losses:Number(e.target.value)})}/></TableCell>
                    <TableCell><Input type="number" className="w-20" value={r.sweepsW} onChange={e=>updateResult(r.team,{sweepsW:Number(e.target.value)})}/></TableCell>
                    <TableCell><Input type="number" className="w-20" value={r.sweepsL} onChange={e=>updateResult(r.team,{sweepsL:Number(e.target.value)})}/></TableCell>
                    <TableCell><Switch checked={!!r.next} onCheckedChange={v=>updateResult(r.team,{next: v?1:0})}/></TableCell>
                    <TableCell><Switch checked={!!r.playoff} onCheckedChange={v=>updateResult(r.team,{playoff: v?1:0})}/></TableCell>
                    <TableCell><Switch checked={!!r.semi} onCheckedChange={v=>updateResult(r.team,{semi: v?1:0})}/></TableCell>
                    <TableCell><Switch checked={!!r.final} onCheckedChange={v=>updateResult(r.team,{final: v?1:0})}/></TableCell>
                    <TableCell><Switch checked={!!r.champ} onCheckedChange={v=>updateResult(r.team,{champ: v?1:0})}/></TableCell>
                    {extraGrund.map(g=> (
                      <TableCell key={g.label}>
                        <Input type="number" className="w-24" value={(r.extra?.[g.label] ?? 0).toString()} onChange={(e)=>updateResultExtra(r.team, g.label, Number(e.target.value))}/>
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Select onValueChange={(val)=> addBonusCount(r.team, val)}>
                            <SelectTrigger className="w-56"><SelectValue placeholder="Legg til bonus (øk teller)"/></SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectLabel>Bonusreglar</SelectLabel>
                                {rules.bonus.map(b=> (
                                  <SelectItem key={b.key} value={b.label}>{b.label} ({b.value>0?`+${b.value}`:b.value})</SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <span className="text-xs text-muted-foreground">{bonusTotalCount} registrert</span>
                        </div>
                        {!!bonusTotalCount && (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(r.bonusCounts||{}).map(([lbl, n]) => (
                              <div key={lbl} className="flex items-center gap-1 bg-secondary text-secondary-foreground rounded px-2 h-6 text-xs">
                                <span>{lbl} × {n}</span>
                                <Button type="button" size="sm" variant="ghost" className="h-5 px-1" onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); removeBonusOnce(r.team, lbl); }}>
                                  <X className="h-3 w-3"/>
                                </Button>
                                <Button type="button" size="sm" variant="ghost" className="h-5 px-1" onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); addBonusCount(r.team, lbl); }}>+
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold whitespace-nowrap">{teamPoints}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Administrer deltakarar" icon={<Users className="h-5 w-5"/>}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Spelar</TableHead><TableHead>Stage 1</TableHead><TableHead>Stage 2</TableHead><TableHead>Stage 3</TableHead><TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.map(p => (
              <TableRow key={p.name}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.s1}</TableCell>
                <TableCell>{p.s2}</TableCell>
                <TableCell>{p.s3}</TableCell>
                <TableCell className="text-right"><Button variant="destructive" size="sm" onClick={()=>deletePlayer(p.name)}>Slett</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex gap-2 mt-3">
          <Button variant="outline" onClick={()=>{localStorage.removeItem(LS_KEYS.results); window.location.reload();}}>Nullstill resultat</Button>
          <Button variant="outline" onClick={()=>{localStorage.removeItem(LS_KEYS.admin); window.location.reload();}}>Logg ut admin</Button>
        </div>
      </Section>
    </div>
  );
}

// --- Velg lag (players) ---
function PlayerPicks({players, setPlayers, results, rules}){
  const [name, setName] = useState("");
  const [s1, setS1] = useState();
  const [s2, setS2] = useState();
  const [s3, setS3] = useState();

  function sameTriplet(a, b){
    if (!a || !b) return false;
    const A = [a.s1,a.s2,a.s3].filter(Boolean).sort().join("|");
    const B = [b.s1,b.s2,b.s3].filter(Boolean).sort().join("|");
    return A.length>0 && A===B;
  }

  function addPlayer(){
    if (!name.trim()) return toast.error("Skriv inn namnet ditt");
    if (!s1 || !s2 || !s3) return toast.error("Vel 1 lag frå kvar stage");

    const newPick = { name: name.trim(), s1, s2, s3 };
    const conflict = players.find(p => p.name !== newPick.name && sameTriplet(p, newPick));
    if (conflict) {
      toast.error(`Du har valgt same tre lag som ${conflict.name}. Bytt eitt lag – eller få ${conflict.name} til å bytte.`);
      return;
    }

    const next = [...players.filter(p=>p.name!==newPick.name), newPick];
    setPlayers(next); savePlayers(next); toast.success("Val lagra");
    setName(""); setS1(undefined); setS2(undefined); setS3(undefined);
  }

  const leaderboard = useMemo(()=> players.map(p=> ({
    name: p.name,
    total: calcPlayerTotal(p, results, rules),
  })).sort((a,b)=> b.total-a.total), [players, results, rules]);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Section title="Vel lag" icon={<Users className="h-5 w-5"/>}>
        <div className="grid gap-4">
          <div>
            <Label>Namnet ditt</Label>
            <Input placeholder="Spelar-namn" value={name} onChange={e=>setName(e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label className="mb-1 block">Stage 1</Label>
              <Select value={s1} onValueChange={setS1}>
                <SelectTrigger><SelectValue placeholder="Vel lag"/></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Stage 1-lag</SelectLabel>
                    {STAGE1.map(t=> <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block">Stage 2</Label>
              <Select value={s2} onValueChange={setS2}>
                <SelectTrigger><SelectValue placeholder="Vel lag"/></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Stage 2-lag</SelectLabel>
                    {STAGE2.map(t=> <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block">Stage 3</Label>
              <Select value={s3} onValueChange={setS3}>
                <SelectTrigger><SelectValue placeholder="Vel lag"/></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Stage 3-lag</SelectLabel>
                    {STAGE3.map(t=> <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={addPlayer}>Lagre val</Button>
            <Button variant="outline" onClick={()=>{ setName(""); setS1(undefined); setS2(undefined); setS3(undefined); }}>Reset</Button>
          </div>
          <p className="text-sm text-muted-foreground">Tips: Du kan redigere valet ditt når som helst – lagre på nytt med same namn.</p>
        </div>
      </Section>

      <Section title="Deltakarar" icon={<BarChart3 className="h-5 w-5"/>}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Spelar</TableHead><TableHead>Stage 1</TableHead><TableHead>Stage 2</TableHead><TableHead>Stage 3</TableHead><TableHead className="text-right">Poeng</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaderboard.map(r=> (
              <TableRow key={r.name}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{players.find(p=>p.name===r.name)?.s1}</TableCell>
                <TableCell>{players.find(p=>p.name===r.name)?.s2}</TableCell>
                <TableCell>{players.find(p=>p.name===r.name)?.s3}</TableCell>
                <TableCell className="text-right font-semibold">{r.total}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {/* Fjernet «Nullstill deltakarar»-knappen her for å unngå uhell */}
      </Section>
    </div>
  );
}

function LeaderboardView({players, results, rules}){
  const rows = useMemo(()=> players.map(p=> ({ name: p.name, total: calcPlayerTotal(p, results, rules) }))
    .sort((a,b)=> b.total-a.total), [players, results, rules]);

  return (
    <Section title="Leaderboard" icon={<Trophy className="h-5 w-5"/>}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead><TableHead>Spelar</TableHead><TableHead>Poeng</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, idx)=> (
            <TableRow key={r.name} className={idx===0?"bg-yellow-50 dark:bg-yellow-900/20":""}>
              <TableCell className="w-10">{idx+1}</TableCell>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="font-semibold">{r.total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}

function Intro(){
  return (
    <Section title="Velkommen" icon={<Info className="h-5 w-5"/>}>
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">🎮 Fantasy CS2 Major – vennelag Pick’em</h3>
        <p>Hei! Hadde vore gøy med ein liten privat <em>intern Pick’em-konkurranse</em> mellom oss 😄 Dette er sjølvsagt frivillig, men kjekt om alle vil vere med!</p>
        <ol className="list-decimal ml-6 space-y-1">
          <li>Vel <strong>1 lag frå kvar stage</strong> – totalt 3 lag. (Sjå lagliste under «Vel lag»)</li>
          <li>Gå til <strong>«Vel lag»</strong>, skriv namnet ditt, og vel lag frå nedtrekka.</li>
          <li>Poeng blir rekna ut automatisk ut frå reglane.</li>
        </ol>
        <p>Reglar og bonus kan justerast av admin. Lykke til – og måtte den beste (eller heldigaste 😅) vinne! 🏆</p>
      </div>
    </Section>
  );
}

export default function AppRoot(){
  const [activeTab, setActiveTab] = useState("intro");
  const [rules, setRules] = useState(()=>loadRules());
  const [results, setResults] = useState(()=>loadResults());
  const [players, setPlayers] = useState(()=>loadPlayers());

  useEffect(()=>{ saveRules(rules); }, [rules]);
  useEffect(()=>{ saveResults(results); }, [results]);
  useEffect(()=>{ savePlayers(players); }, [players]);

  const totalTeams = results.length;
  const totalPlayers = players.length;

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 to-slate-950 p-4 sm:p-8 text-white">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Fantasy CS2 Major</h1>
            <p className="text-sm opacity-80">Enkel vennelag Pick’em – norsk, dynamisk poengsystem</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Card className="px-4 py-2 bg-white/5 border-white/10 text-white"><CardContent className="p-0"><div className="text-xs opacity-70">Lag i systemet</div><div className="text-xl font-bold">{totalTeams}</div></CardContent></Card>
            <Card className="px-4 py-2 bg-white/5 border-white/10 text-white"><CardContent className="p-0"><div className="text-xs opacity-70">Deltakarar</div><div className="text-xl font-bold">{totalPlayers}</div></CardContent></Card>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-4 bg-white/10 text-white">
            <TabsTrigger value="intro">Intro</TabsTrigger>
            <TabsTrigger value="picks">Vel lag</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            <TabsTrigger value="admin">Admin</TabsTrigger>
          </TabsList>

          <TabsContent value="intro" className="mt-4"><Intro/></TabsContent>
          <TabsContent value="picks" className="mt-4"><PlayerPicks players={players} setPlayers={setPlayers} results={results} rules={rules} /></TabsContent>
          <TabsContent value="leaderboard" className="mt-4"><LeaderboardView players={players} results={results} rules={rules} /></TabsContent>
          <TabsContent value="admin" className="mt-4"><Admin rules={rules} setRules={setRules} results={results} setResults={setResults} players={players} setPlayers={setPlayers} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
