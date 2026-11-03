/* Prix des denrées alimentaires au Sénégal : logique du tableau de bord.
   Toutes les valeurs affichées viennent des jeux de données du pipeline (dash.data). */

// ---------- calculs partagés (visibles dans Sources) ----------
dash.calc('dernier_indice', {
  title: 'Indice, dernier mois',
  description: "Dernier mois de l'indice des prix alimentaires du Sénégal, son inflation sur 12 mois et le plus haut atteint par l'indice.",
  inputs: ['indice_alimentaire'],
  fn: (indice_alimentaire) => {
    const lignes = indice_alimentaire.filter((r) => r.indice !== '' && r.indice !== null)
      .sort((a, b) => (a.mois < b.mois ? -1 : 1));
    if (!lignes.length) return [];
    const d = lignes[lignes.length - 1];
    const pic = lignes.reduce((m, r) => (Number(r.indice) > Number(m.indice) ? r : m), lignes[0]);
    return [{
      mois: d.mois, indice: Number(d.indice),
      inflation_12m_pct: d.inflation_12m_pct === '' ? null : Number(d.inflation_12m_pct),
      pic_indice: Number(pic.indice), pic_mois: pic.mois,
    }];
  },
});

dash.calc('resume_senegal', {
  title: 'Synthèse du Sénégal',
  description: 'Produits suivis, en hausse sur 12 mois, en alerte ou en crise, hausses et baisses prévues à 3 mois, marchés et régions suivis.',
  inputs: ['synthese_produits', 'marches'],
  fn: (synthese_produits, marches) => {
    const n = (x) => (x === '' || x === null || x === undefined ? null : Number(x));
    const r = {
      mois: '', nb_produits: 0, nb_hausse_12m: 0, nb_alerte: 0, produit_max: '', var_max_pct: null,
      nb_hausse_prevue: 0, nb_baisse_prevue: 0, produit_prevu_min: '', var_prevue_min_pct: null,
    };
    for (const p of synthese_produits) {
      const v = n(p.var_12m_pct);
      const f = n(p.var_prevue_3m_pct);
      r.nb_produits += 1;
      if (p.mois > r.mois) r.mois = p.mois;
      if (v !== null && v > 0) r.nb_hausse_12m += 1;
      if (p.niveau === 'Alerte' || p.niveau === 'Crise') r.nb_alerte += 1;
      if (v !== null && (r.var_max_pct === null || v > r.var_max_pct)) {
        r.var_max_pct = v;
        r.produit_max = p.produit;
      }
      if (f !== null && f > 0) r.nb_hausse_prevue += 1;
      if (f !== null && f < 0) r.nb_baisse_prevue += 1;
      if (f !== null && (r.var_prevue_min_pct === null || f < r.var_prevue_min_pct)) {
        r.var_prevue_min_pct = f;
        r.produit_prevu_min = p.produit;
      }
    }
    r.nb_marches = new Set(marches.map((m) => `${m.region}|${m.marche}`)).size;
    r.nb_regions = new Set(marches.map((m) => m.region)).size;
    return [r];
  },
});

// ---------- formats (français) ----------
const LOCALE = 'fr-FR';
const ESPACE = ' ';
const nf0 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfSigne = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const nfSigne0 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0, signDisplay: 'exceptZero' });
const fmtMoisLong = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtMoisCourt = new Intl.DateTimeFormat(LOCALE, { month: 'short', year: '2-digit', timeZone: 'UTC' });
const fmtMoisAn = new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric', timeZone: 'UTC' });

const vide = (v) => v === null || v === undefined || v === '' || Number.isNaN(v);
const num = (x) => (x === '' || x === null || x === undefined || Number.isNaN(Number(x)) ? null : Number(x));
const prix = (v) => (vide(v) ? '—' : nf0.format(v));
const pct = (v) => (vide(v) ? '—' : nfSigne.format(v) + ESPACE + '%');
const pctSimple = (v) => (vide(v) ? '—' : nf1.format(v) + ESPACE + '%');
const indice = (v) => (vide(v) ? '—' : nf1.format(v));
const dateMois = (m) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 15));
const moisLong = (m) => (m ? fmtMoisLong.format(dateMois(m)) : '—');
const moisDate = (d) => fmtMoisLong.format(d);
const classeVariation = (v) => (vide(v) || v === 0 ? '' : v > 0 ? 'opa-hausse' : 'opa-baisse');

const FORMATS = {
  nb_produits: String, nb_hausse_12m: String, nb_alerte: String, nb_marches: String, nb_regions: String,
  nb_hausse_prevue: String, nb_baisse_prevue: String,
  inflation_12m_pct: pct, var_12m_pct: pct, var_1m_pct: pct, var_3m_pct: pct, var_prevue_3m_pct: pct,
  var_max_pct: pct, var_prevue_min_pct: pct, mape_pct: pctSimple,
  mois: moisLong, pic_mois: moisLong, indice: indice, pic_indice: indice,
  prix: prix, prevision_3m: prix, alerte: (v) => nf2.format(v),
};
const VARIATIONS = new Set(['inflation_12m_pct', 'var_12m_pct', 'var_1m_pct', 'var_3m_pct', 'var_prevue_3m_pct',
  'var_max_pct', 'var_prevue_min_pct']);

const ORDRE_PRODUITS = ['riz_importe', 'riz_local', 'mais', 'mil', 'sorgho', 'niebe', 'arachide'];
const ordreProduit = (a, b) => ORDRE_PRODUITS.indexOf(a.produit_id) - ORDRE_PRODUITS.indexOf(b.produit_id);
const NIVEAUX = ['Normal', 'Tension', 'Alerte', 'Crise'];
const COULEUR_NIVEAU = {
  Normal: 'color-mix(in srgb, var(--cds-chart-muted) 45%, var(--color-bg))',
  Tension: 'color-mix(in srgb, var(--color-warn) 50%, var(--color-bg))',
  Alerte: 'var(--color-warn)',
  Crise: 'var(--color-bad)',
};
const couleurNiveau = (n) => COULEUR_NIVEAU[n] || 'var(--cds-chart-muted)';

function couleurVariation(v) {
  if (vide(v)) return 'var(--color-bg)';
  if (v === 0) return 'color-mix(in srgb, var(--cds-chart-muted) 25%, var(--color-bg))';
  const t = Math.min(Math.abs(v) / 30, 1);
  return `color-mix(in srgb, ${v > 0 ? 'var(--color-bad)' : 'var(--color-ok)'} ${Math.round(12 + t * 53)}%, var(--color-bg))`;
}

// ---------- marquage des valeurs ----------
const echapper = (v) => String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D').replace(/,/g, '%2C');
const ou = (o) => Object.entries(o).map(([k, v]) => `${k}=${echapper(v)}`).join('&');
const cle = (...parts) => parts.map(echapper).join(',');

function marquer(el, source, champ, where) {
  el.setAttribute('data-source', source);
  if (champ) el.setAttribute('data-field', champ);
  if (where) el.setAttribute('data-where', ou(where));
}

/* Remplit les valeurs fixes de la page marquées data-source/data-field pour une source. */
function remplir(source, ligne, where, racine) {
  for (const el of (racine || document).querySelectorAll(`[data-source="${source}"][data-field]`)) {
    if (el.closest('table, select, #resume')) continue;
    const champ = el.getAttribute('data-field');
    el.classList.remove('opa-hausse', 'opa-baisse');
    if (!ligne) {
      el.textContent = '—';
      el.classList.add('dash-skeleton');
      continue;
    }
    if (where) {
      el.setAttribute('data-where', ou(where));
      el.removeAttribute('data-row');
    } else {
      el.setAttribute('data-row', '0');
      el.removeAttribute('data-where');
    }
    const v = ligne[champ];
    el.textContent = vide(v) ? '—' : (FORMATS[champ] || String)(v);
    el.classList.remove('dash-skeleton');
    if (VARIATIONS.has(champ)) {
      const c = classeVariation(v);
      if (c) el.classList.add(c);
    }
    if (champ === 'niveau') el.setAttribute('data-niveau', v || '');
  }
}

// ---------- données ----------
const memo = new Map();
function donnees(id, convertir) {
  const d = dash.data(id);
  if (d.status !== 'ok' || !Array.isArray(d.data)) return null;
  const m = memo.get(id);
  if (m && m.brut === d.data) return m.valeur;
  const valeur = convertir ? convertir(d.data) : d.data;
  memo.set(id, { brut: d.data, valeur });
  return valeur;
}
function grouper(lignes, f) {
  const m = new Map();
  for (const l of lignes) {
    const k = f(l);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(l);
  }
  return m;
}
const parMois = (a, b) => (a.mois < b.mois ? -1 : a.mois > b.mois ? 1 : 0);
const geometrie = (g) => (typeof g === 'string' ? JSON.parse(g) : g);
const parProduit = (r) => r.produit_id;

const D = {
  indice: () => donnees('indice_alimentaire', (rs) => rs.map((r) => ({
    mois: r.mois, date: dateMois(r.mois), v: num(r.indice), infl: num(r.inflation_12m_pct),
  })).sort(parMois)),
  synthese: () => donnees('synthese_produits', (rs) => rs.map((r) => ({
    ...r, prix: num(r.prix), nb_marches: num(r.nb_marches), var_1m_pct: num(r.var_1m_pct), var_3m_pct: num(r.var_3m_pct),
    var_12m_pct: num(r.var_12m_pct), alerte: num(r.alerte), mape_pct: num(r.mape_pct),
    prevision_3m: num(r.prevision_3m), var_prevue_3m_pct: num(r.var_prevue_3m_pct),
  }))),
  nationales: () => donnees('series_nationales', (rs) => grouper(rs.map((r) => ({
    produit_id: r.produit_id, mois: r.mois, date: dateMois(r.mois), v: num(r.prix), n: num(r.nb_marches), niveau: r.niveau,
  })).sort(parMois), parProduit)),
  previsions: () => donnees('previsions', (rs) => grouper(rs.map((r) => ({
    produit_id: r.produit_id, mois: r.mois, date: dateMois(r.mois), v: num(r.prevision),
    b80: num(r.bas80), h80: num(r.haut80), b95: num(r.bas95), h95: num(r.haut95),
  })).sort(parMois), parProduit)),
  evaluation: () => donnees('evaluation_modeles', (rs) => grouper(rs.map((r) => ({
    ...r, mape_pct: num(r.mape_pct), mae: num(r.mae), rmse: num(r.rmse), nb_tests: num(r.nb_tests),
  })), parProduit)),
  tests: () => donnees('tests_previsions', (rs) => grouper(rs.map((r) => ({
    produit_id: r.produit_id, horizon: num(r.horizon), mois: r.mois, date: dateMois(r.mois),
    reel: num(r.reel), prevu: num(r.prevu),
  })).sort(parMois), parProduit)),
  regionales: () => donnees('series_regionales', (rs) => grouper(rs.map((r) => ({
    produit_id: r.produit_id, region: r.region, mois: r.mois, date: dateMois(r.mois), v: num(r.prix),
  })).sort(parMois), parProduit)),
  regionsListe: () => donnees('synthese_regions', (rs) => rs.map((r) => ({
    ...r, prix: num(r.prix), nb_marches: num(r.nb_marches), var_12m_pct: num(r.var_12m_pct),
  }))),
  regions: () => {
    const l = D.regionsListe();
    return l ? grouper(l, parProduit) : null;
  },
  marches: () => donnees('marches', (rs) => grouper(rs.map((r) => ({
    ...r, lat: num(r.lat), lon: num(r.lon), prix: num(r.prix), var_1m_pct: num(r.var_1m_pct),
    var_12m_pct: num(r.var_12m_pct), alerte: num(r.alerte),
  })), parProduit)),
  carteRegions: () => donnees('carte_regions', (rs) => rs.map((r) => ({ region: r.region, geom: geometrie(r.geometrie) }))),
  cartePays: () => donnees('carte_pays', (rs) => rs.map((r) => ({
    iso3: r.iso3, pays: r.pays, statut: r.statut, geom: geometrie(r.geometrie),
  }))),
  dernier: () => donnees('dernier_indice'),
  resume: () => donnees('resume_senegal'),
};

// ---------- sélection (produit, période) ----------
function choix() {
  const p = dash.params();
  let produit = p.produit || 'riz_importe';
  const synth = D.synthese();
  if (synth && synth.length) {
    const dispo = synth.map((r) => r.produit_id);
    if (!dispo.includes(produit)) produit = ORDRE_PRODUITS.find((x) => dispo.includes(x)) || dispo[0];
  }
  return { produit, periode: p.periode || '5a' };
}

function debutPeriode(dernierMois, periode) {
  if (periode === 'tout') return '0000-00';
  const d = dateMois(dernierMois);
  d.setUTCMonth(d.getUTCMonth() - ((periode === '3a' ? 36 : 60) - 1));
  return d.toISOString().slice(0, 7);
}

function choisirProduit(produitId, versPage) {
  dash.setParams({ produit: produitId });
  if (versPage) montrer(versPage);
}

// ---------- outils de dessin ----------
function largeur(el) {
  return Math.max(260, Math.round(el.getBoundingClientRect().width || el.clientWidth || 600));
}
function svgDans(el, w, h) {
  const svg = d3.select(el).selectAll('svg.opa-svg').data([null]).join('svg')
    .attr('class', 'opa-svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`);
  svg.selectAll('*').remove();
  return svg;
}
function largeurTexte(svg, textes, classe) {
  const t = svg.append('text').attr('class', classe || null).attr('x', 0).attr('y', -50);
  let max = 0;
  for (const s of textes) {
    t.text(s);
    max = Math.max(max, t.node().getComputedTextLength());
  }
  t.remove();
  return Math.ceil(max);
}
/* Prépare la boîte d'un graphique selon l'état de ses sources ; true si tout est chargé. */
function pret(el, ids) {
  let etat = 'ok';
  for (const id of ids) {
    const s = dash.data(id).status;
    if (s === 'error' || s === 'missing' || s === 'declined' || s === 'connect') {
      etat = 'error';
      break;
    }
    if (s !== 'ok') etat = 'loading';
  }
  el.classList.toggle('dash-skeleton', etat === 'loading');
  const sel = d3.select(el);
  if (etat !== 'ok') {
    sel.selectAll(':scope > :not(.opa-echec)').remove();
    sel.selectAll(':scope > .opa-echec').data(etat === 'error' ? [null] : []).join((e) => {
      const d = e.append('div').attr('class', 'opa-echec');
      d.append('span').attr('class', 'opa-point');
      d.append('span').text('Échec du chargement');
      return d;
    });
    return false;
  }
  sel.selectAll(':scope > .opa-echec, :scope > .opa-vide').remove();
  return true;
}
function messageVide(el, texte) {
  d3.select(el).selectAll(':scope > *').remove();
  d3.select(el).append('p').attr('class', 'opa-vide').text(texte);
}
function bulleDe(el) {
  return d3.select(el).selectAll(':scope > div.opa-bulle').data([null]).join('div')
    .attr('class', 'opa-bulle').attr('role', 'status').property('hidden', true);
}
function montrerBulle(bulle, el, x, y, titre, lignes) {
  bulle.selectAll('*').remove();
  bulle.append('div').attr('class', 'opa-bulle-titre').text(titre);
  for (const l of lignes) {
    const r = bulle.append('div').attr('class', 'opa-bulle-ligne');
    if (l.couleur) r.append('span').attr('class', 'opa-pastille-couleur').style('background', l.couleur);
    r.append('span').text(l.nom);
    if (l.valeur !== undefined) r.append('b').text(l.valeur);
  }
  const n = bulle.node();
  n.hidden = false;
  const W = el.clientWidth;
  const H = el.clientHeight;
  const bw = n.offsetWidth;
  const bh = n.offsetHeight;
  let gauche = x + 14;
  if (gauche + bw > W) gauche = x - bw - 14;
  gauche = Math.max(0, Math.min(gauche, W - bw));
  let haut = y - bh - 10;
  if (haut < 0) haut = Math.min(y + 14, Math.max(0, H - bh));
  n.style.left = `${gauche}px`;
  n.style.top = `${haut}px`;
}
const cacherBulle = (bulle) => bulle.property('hidden', true);

function ticksTemps(x, place) {
  const [d0, d1] = x.domain();
  const mois = (d1.getUTCFullYear() - d0.getUTCFullYear()) * 12 + d1.getUTCMonth() - d0.getUTCMonth();
  const max = Math.max(2, Math.floor(place / 72));
  if (mois > 30) {
    const ans = d3.utcYear.range(d3.utcYear.ceil(d0), d1);
    const pas = Math.max(1, Math.ceil(ans.length / max));
    return { valeurs: ans.filter((d) => d.getUTCFullYear() % pas === 0), format: (d) => String(d.getUTCFullYear()) };
  }
  const pas = [1, 2, 3, 6, 12].find((p) => mois / p <= max) || 12;
  const valeurs = d3.utcMonth.range(d3.utcMonth.ceil(d0), d1).filter((d) => d.getUTCMonth() % pas === 0);
  return { valeurs, format: (d) => fmtMoisCourt.format(d) };
}

function etalerEtiquettes(items, min, max, ecart) {
  items.sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i += 1) {
    if (items[i].y - items[i - 1].y < ecart) items[i].y = items[i - 1].y + ecart;
  }
  const trop = items.length ? items[items.length - 1].y - max : 0;
  if (trop > 0) {
    items[items.length - 1].y -= trop;
    for (let i = items.length - 2; i >= 0; i -= 1) {
      if (items[i + 1].y - items[i].y < ecart) items[i].y = items[i + 1].y - ecart;
    }
  }
  for (const it of items) it.y = Math.max(min, it.y);
  return items;
}

/* Courbes temporelles : séries, bandes d'incertitude, repère vertical, bande d'alertes, bulle.
   formatY sert aux graduations, formatValeur aux étiquettes de fin et à la bulle. */
function graphiqueLignes(el, o) {
  const w = largeur(el);
  const h = o.hauteur || 260;
  const svg = svgDans(el, w, h);
  const bulle = bulleDe(el);
  cacherBulle(bulle);
  const tous = o.series.flatMap((s) => s.points.filter((p) => !vide(p.v)));
  if (!tous.length) return;
  let ymin = d3.min(tous, (p) => p.v);
  let ymax = d3.max(tous, (p) => p.v);
  for (const b of o.bandes || []) {
    for (const p of b.points) {
      ymin = Math.min(ymin, p.bas);
      ymax = Math.max(ymax, p.haut);
    }
  }
  const marge = (ymax - ymin) * 0.08 || Math.abs(ymax) * 0.1 || 1;
  const bas = h - (o.alertes ? 44 : 24);
  const y = d3.scaleLinear([Math.max(0, ymin - marge), ymax + marge], [bas, 12]).nice(5);
  const ticksY = y.ticks(5);
  const fY = o.formatY || prix;
  const fV = o.formatValeur || fY;
  const ml = largeurTexte(svg, ticksY.map(fY)) + 10;
  const finales = o.series.filter((s) => s.fin && s.points.length);
  const etiquettes = finales.map((s) => `${s.fin} ${fV(s.points[s.points.length - 1].v)}`);
  const mr = finales.length ? Math.min(largeurTexte(svg, etiquettes, 'opa-fort') + 12, Math.round(w * 0.4)) : 12;
  const [d0, d1] = d3.extent(tous, (p) => p.date);
  const x = d3.scaleUtc([d0, d1 > d0 ? d1 : new Date(+d0 + 864e5)], [ml, w - mr]);

  svg.append('g').attr('class', 'opa-grille-y').selectAll('line').data(ticksY).join('line')
    .attr('x1', ml).attr('x2', w - mr).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
  svg.append('g').selectAll('text').data(ticksY).join('text')
    .attr('x', ml - 8).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end').text(fY);
  const tx = ticksTemps(x, w - ml - mr);
  svg.append('g').selectAll('text').data(tx.valeurs).join('text')
    .attr('x', (d) => x(d)).attr('y', h - 6).attr('text-anchor', 'middle').text(tx.format);
  if (o.reference !== undefined && o.reference > y.domain()[0] && o.reference < y.domain()[1]) {
    svg.append('line').attr('class', 'opa-reference').attr('x1', ml).attr('x2', w - mr)
      .attr('y1', y(o.reference)).attr('y2', y(o.reference));
  }
  for (const b of o.bandes || []) {
    svg.append('path').style('fill', b.couleur).style('opacity', b.opacite)
      .attr('d', d3.area().x((p) => x(p.date)).y0((p) => y(p.bas)).y1((p) => y(p.haut))(b.points));
  }
  if (o.repere) {
    const xr = x(o.repere.date);
    svg.append('line').attr('class', 'opa-reference').attr('x1', xr).attr('x2', xr).attr('y1', 12).attr('y2', bas);
    svg.append('text').attr('x', xr - 4).attr('y', 22).attr('text-anchor', 'end').text(o.repere.texte);
  }
  if (o.alertes) {
    const pas = Math.max(1, (w - ml - mr) / Math.max(1, d3.utcMonth.count(d0, d1) + 1));
    svg.append('g').selectAll('rect').data(o.alertes.filter((a) => a.niveau)).join('rect')
      .attr('x', (a) => x(a.date) - pas / 2).attr('width', Math.max(1, pas - 1))
      .attr('y', bas + 8).attr('height', 8).attr('rx', 1)
      .style('fill', (a) => couleurNiveau(a.niveau));
  }
  const ligne = d3.line().defined((p) => !vide(p.v)).x((p) => x(p.date)).y((p) => y(p.v));
  for (const s of o.series) {
    svg.append('path').attr('class', 'opa-ligne').attr('d', ligne(s.points))
      .style('stroke', s.couleur).style('stroke-width', s.epaisseur || 2)
      .style('stroke-dasharray', s.pointille ? '5 4' : null).style('opacity', s.opacite || 1);
    if (s.marqueurs) {
      svg.append('g').selectAll('circle').data(s.points.filter((p) => !vide(p.v))).join('circle')
        .attr('cx', (p) => x(p.date)).attr('cy', (p) => y(p.v)).attr('r', 2.5).style('fill', s.couleur);
    }
  }
  const items = etalerEtiquettes(finales.map((s) => {
    const p = s.points[s.points.length - 1];
    return { s, p, y: y(p.v) };
  }), 12, bas, 15);
  for (const it of items) {
    svg.append('circle').attr('cx', x(it.p.date)).attr('cy', y(it.p.v)).attr('r', 3).style('fill', it.s.couleur);
    svg.append('text').attr('class', 'opa-fort').attr('x', x(it.p.date) + 7).attr('y', it.y).attr('dy', '0.32em')
      .text(`${it.s.fin} ${fV(it.p.v)}`);
  }

  const dates = Array.from(new Set(tous.map((p) => +p.date))).sort((a, b) => a - b).map((t) => new Date(t));
  const regle = svg.append('line').attr('class', 'opa-regle').attr('y1', 12).attr('y2', bas).style('opacity', 0);
  const survol = svg.append('g');
  svg.append('rect').attr('x', ml).attr('y', 0).attr('width', Math.max(0, w - mr - ml)).attr('height', h)
    .style('fill', 'transparent')
    .on('pointermove', (event) => {
      const [sx] = d3.pointer(event, svg.node());
      const [bx, by] = d3.pointer(event, el);
      const d = dates[d3.bisector((t) => t).center(dates, x.invert(sx))];
      regle.attr('x1', x(d)).attr('x2', x(d)).style('opacity', 1);
      const lignes = [];
      const pts = [];
      for (const s of o.series) {
        const p = s.points.find((q) => +q.date === +d && !q.lien);
        if (p && !vide(p.v)) {
          lignes.push({ couleur: o.series.length > 1 ? s.couleur : null, nom: s.nom, valeur: fV(p.v) });
          pts.push({ cx: x(d), cy: y(p.v), c: s.couleur });
        }
      }
      if (o.bulle) lignes.push(...o.bulle(d));
      survol.selectAll('circle').data(pts).join('circle').attr('cx', (p) => p.cx).attr('cy', (p) => p.cy).attr('r', 4)
        .style('fill', (p) => p.c).style('stroke', 'var(--color-panel)').style('stroke-width', 1.5);
      montrerBulle(bulle, el, bx, by, moisDate(d), lignes);
    })
    .on('pointerleave', () => {
      regle.style('opacity', 0);
      survol.selectAll('*').remove();
      cacherBulle(bulle);
    });
}

// ---------- cartes ----------
function anneaux(g) {
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}
function boite(geoms) {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const g of geoms) {
    for (const poly of anneaux(g)) {
      for (const [x, y] of poly[0]) {
        if (x < b.x0) b.x0 = x;
        if (x > b.x1) b.x1 = x;
        if (y < b.y0) b.y0 = y;
        if (y > b.y1) b.y1 = y;
      }
    }
  }
  return b;
}
function hauteurCarte(b, w, min, max) {
  const k0 = Math.cos(((b.y0 + b.y1) / 2) * Math.PI / 180);
  return Math.round(Math.max(min, Math.min(max, w * (b.y1 - b.y0) / ((b.x1 - b.x0) * k0))));
}
function projection(b, w, h, marge) {
  const k0 = Math.cos(((b.y0 + b.y1) / 2) * Math.PI / 180);
  const k = Math.min((w - 2 * marge) / ((b.x1 - b.x0) * k0), (h - 2 * marge) / (b.y1 - b.y0));
  const dx = (w - (b.x1 - b.x0) * k0 * k) / 2;
  const dy = (h - (b.y1 - b.y0) * k) / 2;
  return (lon, lat) => [dx + (lon - b.x0) * k0 * k, dy + (b.y1 - lat) * k];
}
function chemin(g, p) {
  let s = '';
  for (const poly of anneaux(g)) {
    for (const anneau of poly) {
      for (let i = 0; i < anneau.length; i += 1) {
        const [px, py] = p(anneau[i][0], anneau[i][1]);
        s += `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
      }
      s += 'Z';
    }
  }
  return s;
}
function dansAnneau(x, y, a) {
  let dedans = false;
  for (let i = 0, j = a.length - 1; i < a.length; j = i, i += 1) {
    const [xi, yi] = a[i];
    const [xj, yj] = a[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}
function dansGeom(x, y, g) {
  return anneaux(g).some((poly) => dansAnneau(x, y, poly[0]) && !poly.slice(1).some((trou) => dansAnneau(x, y, trou)));
}
/* Où écrire le nom d'une zone : centre de sa partie visible dans le cadre, ramené à l'intérieur de la zone. */
function pointEtiquette(g, cadre) {
  const v = boite([g]);
  const x0 = Math.max(v.x0, cadre.x0);
  const x1 = Math.min(v.x1, cadre.x1);
  const y0 = Math.max(v.y0, cadre.y0);
  const y1 = Math.min(v.y1, cadre.y1);
  if (x0 >= x1 || y0 >= y1) return null;
  const n = 16;
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / n;
      const y = y0 + ((y1 - y0) * (j + 0.5)) / n;
      if (dansGeom(x, y, g)) pts.push([x, y]);
    }
  }
  if (!pts.length) return null;
  const mx = d3.mean(pts, (q) => q[0]);
  const my = d3.mean(pts, (q) => q[1]);
  if (dansGeom(mx, my, g)) return [mx, my];
  const d2 = (q) => (q[0] - mx) ** 2 + (q[1] - my) ** 2;
  return pts.reduce((m, q) => (d2(q) < d2(m) ? q : m));
}
function legendeVariation(el, avecNiveaux) {
  el.replaceChildren();
  const deg = document.createElement('span');
  deg.className = 'opa-degrade';
  const g = document.createElement('span');
  g.textContent = '−30 %';
  const barre = document.createElement('span');
  barre.className = 'opa-degrade-barre';
  barre.style.background = `linear-gradient(to right, ${[-30, -15, -4, 0, 4, 15, 30].map(couleurVariation).join(', ')})`;
  const d = document.createElement('span');
  d.textContent = '+30 % et plus';
  deg.append(g, barre, d);
  el.append(deg);
  if (avecNiveaux) legendeNiveaux(el, false);
}
function legendeNiveaux(el, vider) {
  if (vider) el.replaceChildren();
  for (const n of NIVEAUX) {
    const item = document.createElement('span');
    item.className = 'opa-legende-item';
    const pastille = document.createElement('span');
    pastille.className = 'opa-pastille-couleur';
    pastille.style.background = couleurNiveau(n);
    item.append(pastille, document.createTextNode(n));
    el.append(item);
  }
}

// ---------- en-tête ----------
function dessinerResume() {
  const el = document.getElementById('resume');
  const r = (D.resume() || [])[0];
  const d = (D.dernier() || [])[0];
  if (!r || !d) {
    el.textContent = '—';
    el.classList.add('dash-skeleton');
    return;
  }
  el.classList.remove('dash-skeleton');
  el.replaceChildren();
  const texte = (s) => el.append(document.createTextNode(s));
  const valeur = (s, source, champ, classe) => {
    const span = document.createElement('span');
    span.textContent = s;
    if (classe) span.className = classe;
    marquer(span, source, champ);
    span.setAttribute('data-row', '0');
    el.append(span);
  };
  texte('En ');
  valeur(moisLong(d.mois), 'dernier_indice', 'mois');
  texte(', l’indice des prix alimentaires du Sénégal est à ');
  valeur(indice(d.indice), 'dernier_indice', 'indice');
  texte(' (base 100 en 2019), soit ');
  valeur(pct(d.inflation_12m_pct), 'dernier_indice', 'inflation_12m_pct', classeVariation(d.inflation_12m_pct));
  texte(' en un an. ');
  if (r.nb_hausse_12m > 0) {
    texte('Produit en plus forte hausse sur un an : ');
    valeur(r.produit_max, 'resume_senegal', 'produit_max');
    texte(' (');
    valeur(pct(r.var_max_pct), 'resume_senegal', 'var_max_pct', classeVariation(r.var_max_pct));
    texte('). ');
  } else {
    texte('Aucun produit n’est plus cher qu’il y a un an. ');
  }
  if (r.nb_alerte > 0) {
    texte('Produits en alerte ou en crise : ');
    valeur(String(r.nb_alerte), 'resume_senegal', 'nb_alerte');
    texte('. ');
  } else {
    texte('Aucun produit n’est en alerte. ');
  }
  const s = (n) => (n > 1 ? 's' : '');
  texte('D’ici 3 mois, les modèles prévoient ');
  valeur(String(r.nb_baisse_prevue), 'resume_senegal', 'nb_baisse_prevue');
  texte(` baisse${s(r.nb_baisse_prevue)} et `);
  valeur(String(r.nb_hausse_prevue), 'resume_senegal', 'nb_hausse_prevue');
  texte(` hausse${s(r.nb_hausse_prevue)}`);
  if (r.produit_prevu_min && r.var_prevue_min_pct < 0) {
    texte(' ; la plus forte baisse concerne : ');
    valeur(r.produit_prevu_min, 'resume_senegal', 'produit_prevu_min');
    texte(' (');
    valeur(pct(r.var_prevue_min_pct), 'resume_senegal', 'var_prevue_min_pct', 'opa-baisse');
    texte(')');
  }
  texte('.');
}

// ---------- filtres et onglets ----------
const selProduit = document.getElementById('filtre-produit');
const selPeriode = document.getElementById('filtre-periode');
selProduit.addEventListener('change', () => dash.setParams({ produit: selProduit.value || null }));
selPeriode.addEventListener('change', () => dash.setParams({ periode: selPeriode.value }));

function dessinerFiltres(c) {
  const prods = [...(D.synthese() || [])].sort(ordreProduit);
  selProduit.replaceChildren(...prods.map((r) => new Option(r.produit, r.produit_id)));
  if (c.produit) selProduit.value = c.produit;
  selPeriode.value = c.periode;
}

const PAGES = ['ensemble', 'produit', 'methode'];
let page = PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'ensemble';
function afficherPage() {
  for (const p of PAGES) {
    document.getElementById(p).hidden = p !== page;
    const b = document.getElementById(`onglet-${p}`);
    b.setAttribute('aria-selected', String(p === page));
    b.tabIndex = p === page ? 0 : -1;
  }
}
function montrer(nom) {
  page = nom;
  afficherPage();
  dash.setLink(nom);
  dessiner();
}
for (const p of PAGES) document.getElementById(`onglet-${p}`).addEventListener('click', () => montrer(p));
document.querySelector('.opa-onglets').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = PAGES.indexOf(page) + (e.key === 'ArrowRight' ? 1 : -1);
  const suivant = PAGES[(i + PAGES.length) % PAGES.length];
  montrer(suivant);
  document.getElementById(`onglet-${suivant}`).focus();
});

// ---------- page « Vue d'ensemble » ----------
function dessinerEnsemble(c) {
  const racine = document.getElementById('ensemble');
  remplir('dernier_indice', (D.dernier() || [])[0], null, racine);
  remplir('resume_senegal', (D.resume() || [])[0], null, racine);
  dessinerIndice(c);
  dessinerCarte(c);
  dessinerTableProduits(c);
  dessinerChaleur(c);
}

function dessinerIndice(c) {
  const el = document.getElementById('graph-indice');
  if (!pret(el, ['indice_alimentaire'])) return;
  const serie = D.indice().filter((p) => !vide(p.v));
  if (!serie.length) {
    messageVide(el, 'Pas d’indice disponible.');
    return;
  }
  const debut = debutPeriode(serie[serie.length - 1].mois, c.periode);
  const pts = serie.filter((p) => p.mois >= debut);
  graphiqueLignes(el, {
    hauteur: 280,
    formatY: (v) => nf0.format(v),
    formatValeur: indice,
    reference: 100,
    series: [{ nom: 'Indice', couleur: dash.colors[0], points: pts, fin: 'Indice' }],
    bulle: (d) => {
      const p = pts.find((q) => +q.date === +d);
      return p && !vide(p.infl) ? [{ nom: 'Sur 12 mois', valeur: pct(p.infl) }] : [];
    },
  });
}

function dessinerCarte(c) {
  const el = document.getElementById('graph-carte');
  const legende = document.getElementById('legende-carte');
  const titre = document.getElementById('titre-carte');
  if (!pret(el, ['carte_regions', 'carte_pays', 'synthese_regions', 'marches'])) {
    legende.replaceChildren();
    return;
  }
  const geo = D.carteRegions();
  const voisins = D.cartePays().filter((f) => f.statut === 'voisin');
  const regions = new Map((D.regions().get(c.produit) || []).map((r) => [r.region, r]));
  const marches = D.marches().get(c.produit) || [];
  const ligne = (D.synthese() || []).find((r) => r.produit_id === c.produit);
  titre.textContent = ligne ? `Carte des prix : ${ligne.produit}` : 'Carte des prix';
  if (!geo.length) {
    messageVide(el, 'Pas de carte disponible.');
    legende.replaceChildren();
    return;
  }
  const w = largeur(el);
  const b = boite(geo.map((f) => f.geom));
  b.x0 -= 0.3; b.x1 += 0.3; b.y0 -= 0.3; b.y1 += 0.3;
  const h = hauteurCarte(b, w, 240, 460);
  const p = projection(b, w, h, 2);
  const svg = svgDans(el, w, h);
  const bulle = bulleDe(el);
  cacherBulle(bulle);
  svg.append('g').selectAll('path').data(voisins).join('path').attr('class', 'opa-voisin').attr('d', (f) => chemin(f.geom, p));
  svg.append('g').selectAll('path').data(geo).join('path').attr('class', 'opa-region')
    .attr('d', (f) => chemin(f.geom, p))
    .style('fill', (f) => couleurVariation(regions.get(f.region)?.var_12m_pct))
    .on('pointermove', (event, f) => {
      const r = regions.get(f.region);
      const [bx, by] = d3.pointer(event, el);
      montrerBulle(bulle, el, bx, by, f.region, r ? [
        { nom: 'Prix', valeur: `${prix(r.prix)} FCFA` },
        { nom: 'Sur 12 mois', valeur: pct(r.var_12m_pct) },
        { nom: 'Marchés relevés', valeur: String(r.nb_marches) },
        { nom: 'Mois', valeur: moisLong(r.mois) },
      ] : [{ nom: 'Pas de relevé récent pour ce produit' }]);
    })
    .on('pointerleave', () => cacherBulle(bulle));
  const dedans = marches.filter((m) => !vide(m.lat) && !vide(m.lon)
    && m.lon >= b.x0 && m.lon <= b.x1 && m.lat >= b.y0 && m.lat <= b.y1);
  const ordre = (m) => NIVEAUX.indexOf(m.niveau);
  svg.append('g').selectAll('circle').data([...dedans].sort((a, b2) => ordre(a) - ordre(b2))).join('circle')
    .attr('class', 'opa-marche').attr('r', 4.5)
    .attr('cx', (m) => p(m.lon, m.lat)[0]).attr('cy', (m) => p(m.lon, m.lat)[1])
    .style('fill', (m) => couleurNiveau(m.niveau))
    .on('pointermove', (event, m) => {
      const [bx, by] = d3.pointer(event, el);
      montrerBulle(bulle, el, bx, by, `${m.marche} · ${m.region}`, [
        { nom: 'Prix', valeur: `${prix(m.prix)} FCFA` },
        { nom: 'Sur 1 mois', valeur: pct(m.var_1m_pct) },
        { nom: 'Sur 12 mois', valeur: pct(m.var_12m_pct) },
        { nom: 'Alerte', valeur: m.niveau || 'non calculée' },
        { nom: 'Relevé', valeur: moisLong(m.mois) },
      ]);
    })
    .on('pointerleave', () => cacherBulle(bulle));
  // noms des régions puis des pays voisins, sans chevauchement
  const textes = svg.append('g');
  const places = [];
  const poser = (nom, lon, lat, classe) => {
    const [x, y] = p(lon, lat);
    if (x < 0 || x > w || y < 0 || y > h) return;
    const t = textes.append('text').attr('class', `opa-carte-label ${classe}`).attr('x', x).attr('y', y)
      .attr('text-anchor', 'middle').attr('dy', '0.32em').text(nom);
    const bb = t.node().getBBox();
    const gene = bb.x < 0 || bb.x + bb.width > w || places.some((q) => bb.x < q.x + q.width + 2
      && q.x < bb.x + bb.width + 2 && bb.y < q.y + q.height && q.y < bb.y + bb.height);
    if (gene) t.remove();
    else places.push(bb);
  };
  for (const f of geo) {
    const pt = pointEtiquette(f.geom, b);
    if (pt) poser(f.region, pt[0], pt[1], 'opa-fort');
  }
  for (const f of voisins) {
    const pt = pointEtiquette(f.geom, b);
    if (pt) poser(f.pays, pt[0], pt[1], 'opa-voisin-label');
  }
  legendeVariation(legende, true);
}

function sparkline(td, points) {
  const w = 96;
  const h = 26;
  const svg = d3.select(td).append('svg').attr('class', 'opa-spark').attr('width', w).attr('height', h)
    .attr('viewBox', `0 0 ${w} ${h}`).attr('aria-hidden', 'true');
  if (points.length < 2) return;
  const x = d3.scaleUtc(d3.extent(points, (p) => p.date), [2, w - 4]);
  const y = d3.scaleLinear(d3.extent(points, (p) => p.v), [h - 3, 3]);
  svg.append('path').attr('class', 'opa-ligne').attr('d', d3.line().x((p) => x(p.date)).y((p) => y(p.v))(points))
    .style('stroke', dash.colors[0]).style('stroke-width', 1.5);
  const der = points[points.length - 1];
  svg.append('circle').attr('cx', x(der.date)).attr('cy', y(der.v)).attr('r', 2.5).style('fill', dash.colors[0]);
}

function cellule(tr, texte, classe) {
  const td = document.createElement('td');
  if (classe) {
    const s = document.createElement('span');
    s.className = classe;
    s.textContent = texte;
    td.append(s);
  } else {
    td.textContent = texte;
  }
  tr.append(td);
  return td;
}
function celluleNiveau(tr, niveau) {
  const td = document.createElement('td');
  if (niveau) {
    const s = document.createElement('span');
    s.className = 'opa-niveau';
    s.setAttribute('data-niveau', niveau);
    s.textContent = niveau;
    td.append(s);
  } else {
    td.textContent = '—';
  }
  tr.append(td);
  return td;
}
function etatTable(table, ids) {
  const boiteTable = table.closest('.opa-table-boite');
  const ok = ids.every((id) => dash.data(id).status === 'ok');
  boiteTable.classList.toggle('dash-skeleton', !ok);
  if (!ok) table.tBodies[0].replaceChildren();
  return ok;
}

function dessinerTableProduits(c) {
  const table = document.getElementById('tableau-produits');
  if (!etatTable(table, ['synthese_produits', 'series_nationales'])) return;
  const nat = D.nationales();
  const lignes = [...D.synthese()].sort(ordreProduit);
  table.tBodies[0].replaceChildren(...lignes.map((r) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-key', cle(r.produit_id));
    tr.tabIndex = 0;
    if (r.produit_id === c.produit) tr.classList.add('opa-choisi');
    cellule(tr, r.produit);
    cellule(tr, prix(r.prix));
    cellule(tr, pct(r.var_1m_pct), classeVariation(r.var_1m_pct));
    cellule(tr, pct(r.var_12m_pct), classeVariation(r.var_12m_pct));
    celluleNiveau(tr, r.niveau);
    cellule(tr, prix(r.prevision_3m));
    cellule(tr, pct(r.var_prevue_3m_pct), classeVariation(r.var_prevue_3m_pct));
    cellule(tr, pctSimple(r.mape_pct));
    const serie = (nat.get(r.produit_id) || []).slice(-24);
    sparkline(cellule(tr, ''), serie.filter((p) => !vide(p.v)));
    return tr;
  }));
}
function ouvrirLigneProduit(tr) {
  if (!tr || !tr.dataset.key) return;
  choisirProduit(decodeURIComponent(tr.dataset.key), 'produit');
}
document.getElementById('tableau-produits').addEventListener('click', (e) => ouvrirLigneProduit(e.target.closest('tr[data-key]')));
document.getElementById('tableau-produits').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') ouvrirLigneProduit(e.target.closest('tr[data-key]'));
});

/* Tableau croisé régions × produits : variation sur 12 mois. */
function dessinerChaleur(c) {
  const el = document.getElementById('graph-chaleur');
  if (!pret(el, ['synthese_regions', 'synthese_produits'])) return;
  const synth = D.synthese();
  const lignes = D.regionsListe();
  const produits = ORDRE_PRODUITS.filter((pid) => synth.some((r) => r.produit_id === pid));
  const libelle = new Map(synth.map((r) => [r.produit_id, r.produit]));
  const unite = new Map(synth.map((r) => [r.produit_id, r.unite]));
  const regions = [...new Set(lignes.map((r) => r.region))].sort((a, b) => a.localeCompare(b, LOCALE));
  const parCle = new Map(lignes.map((r) => [`${r.region}|${r.produit_id}`, r]));
  const W = Math.max(300, Math.round(el.parentElement.getBoundingClientRect().width || 600));
  const svg = svgDans(el, W, 100);
  const lw = largeurTexte(svg, regions) + 14;
  const cw = Math.max(46, Math.floor((W - lw - 4) / produits.length));
  const ch = 28;
  // titres de colonnes sur une ligne, sinon sur deux, sinon inclinés
  const titres = produits.map((pid) => libelle.get(pid));
  const coupe = (t) => {
    const mots = t.split(' ');
    let mieux = [t];
    let pire = Infinity;
    for (let i = 1; i < mots.length; i += 1) {
      const l = [mots.slice(0, i).join(' '), mots.slice(i).join(' ')];
      const m = Math.max(l[0].length, l[1].length);
      if (m < pire) {
        pire = m;
        mieux = l;
      }
    }
    return mieux;
  };
  const mode = largeurTexte(svg, titres, 'opa-fort') + 8 <= cw ? 1
    : largeurTexte(svg, titres.flatMap(coupe), 'opa-fort') + 8 <= cw ? 2 : 0;
  const plusLong = largeurTexte(svg, titres, 'opa-fort');
  const hh = mode === 1 ? 26 : mode === 2 ? 40 : Math.min(110, Math.round(plusLong * 0.6) + 22);
  const debord = mode ? 4 : Math.max(4, Math.round(plusLong * 0.82 - cw / 2) + 4);
  const totalW = lw + cw * produits.length + debord;
  const H = hh + ch * regions.length + 4;
  svg.attr('viewBox', `0 0 ${totalW} ${H}`).style('min-width', `${totalW}px`);
  const bulle = bulleDe(el);
  cacherBulle(bulle);
  const lignesTitre = (pid) => (mode === 2 ? coupe(libelle.get(pid)) : [libelle.get(pid)]);
  const entetes = svg.append('g').selectAll('text').data(produits).join('text')
    .attr('class', (pid) => (pid === c.produit ? 'opa-fort' : null))
    .attr('transform', (pid, j) => (mode ? `translate(${lw + j * cw + cw / 2},${hh - 9 - 14 * (lignesTitre(pid).length - 1)})`
      : `translate(${lw + j * cw + cw / 2 - 4},${hh - 8}) rotate(-35)`))
    .attr('text-anchor', mode ? 'middle' : 'start');
  entetes.selectAll('tspan').data(lignesTitre).join('tspan')
    .attr('x', 0).attr('dy', (t, i) => (i ? 14 : 0)).text((t) => t);
  svg.append('g').selectAll('text').data(regions).join('text')
    .attr('x', lw - 10).attr('y', (reg, i) => hh + i * ch + ch / 2).attr('dy', '0.32em').attr('text-anchor', 'end')
    .text((reg) => reg);
  const cellules = [];
  regions.forEach((reg, i) => produits.forEach((pid, j) => cellules.push({ i, j, pid, r: parCle.get(`${reg}|${pid}`), reg })));
  const g = svg.append('g').selectAll('g').data(cellules).join('g')
    .attr('transform', (k) => `translate(${lw + k.j * cw},${hh + k.i * ch})`)
    .style('cursor', (k) => (k.r ? 'pointer' : 'default'));
  g.append('rect').attr('x', 1).attr('y', 1).attr('width', cw - 2).attr('height', ch - 2).attr('rx', 3)
    .style('fill', (k) => (k.r ? couleurVariation(k.r.var_12m_pct) : 'transparent'))
    .style('stroke', (k) => (k.r ? (k.pid === c.produit ? 'var(--color-fg-muted)' : 'none') : 'var(--color-border-line)'))
    .style('stroke-dasharray', (k) => (k.r ? null : '2 2'));
  g.filter((k) => k.r && !vide(k.r.var_12m_pct)).append('text').attr('x', cw / 2).attr('y', ch / 2).attr('dy', '0.32em')
    .attr('text-anchor', 'middle').style('fill', 'var(--color-fg)').text((k) => nfSigne0.format(k.r.var_12m_pct));
  g.filter((k) => k.r)
    .on('click', (event, k) => choisirProduit(k.pid, 'produit'))
    .on('pointermove', (event, k) => {
      const [bx, by] = d3.pointer(event, el);
      montrerBulle(bulle, el, bx, by, `${libelle.get(k.pid)} · ${k.reg}`, [
        { nom: 'Prix', valeur: `${prix(k.r.prix)} FCFA/${unite.get(k.pid)}` },
        { nom: 'Sur 12 mois', valeur: pct(k.r.var_12m_pct) },
        { nom: 'Marchés relevés', valeur: String(k.r.nb_marches) },
        { nom: 'Mois', valeur: moisLong(k.r.mois) },
      ]);
    })
    .on('pointerleave', () => cacherBulle(bulle));
}

// ---------- page « Produit et prévisions » ----------
let horizon = 1;
let tri = { champ: 'var_12m_pct', sens: -1 };
let recherche = '';
for (const hzn of [1, 3]) {
  document.getElementById(`horizon-${hzn}`).addEventListener('click', () => {
    horizon = hzn;
    document.getElementById('horizon-1').setAttribute('aria-pressed', String(hzn === 1));
    document.getElementById('horizon-3').setAttribute('aria-pressed', String(hzn === 3));
    dessinerTests(choix());
  });
}
document.getElementById('recherche-marche').addEventListener('input', (e) => {
  recherche = e.target.value;
  dessinerMarches(choix());
});
for (const bouton of document.querySelectorAll('#tableau-marches .opa-tri')) {
  bouton.addEventListener('click', () => {
    const champ = bouton.dataset.tri;
    tri = tri.champ === champ ? { champ, sens: -tri.sens } : { champ, sens: ['marche', 'region'].includes(champ) ? 1 : -1 };
    dessinerMarches(choix());
  });
}

function dessinerProduit(c) {
  const racine = document.getElementById('produit');
  const synth = D.synthese();
  const ligne = synth && synth.find((r) => r.produit_id === c.produit);
  remplir('synthese_produits', ligne, ligne ? { produit_id: ligne.produit_id } : null, racine);
  dessinerPrevision(c);
  dessinerBarresRegions(c);
  dessinerLignesRegions(c);
  dessinerTests(c);
  dessinerModeles(c);
  dessinerMarches(c);
}

function dessinerPrevision(c) {
  const el = document.getElementById('graph-prevision');
  const legende = document.getElementById('legende-prevision');
  if (!pret(el, ['series_nationales', 'previsions'])) {
    legende.replaceChildren();
    return;
  }
  const hist = (D.nationales().get(c.produit) || []).filter((p) => !vide(p.v));
  const prev = D.previsions().get(c.produit) || [];
  if (!hist.length) {
    messageVide(el, 'Pas de série pour ce produit.');
    legende.replaceChildren();
    return;
  }
  const debut = debutPeriode(hist[hist.length - 1].mois, c.periode);
  const obs = hist.filter((p) => p.mois >= debut);
  const dernier = obs[obs.length - 1];
  const couleur = dash.colors[0];
  const bande = (b, hh) => [{ date: dernier.date, bas: dernier.v, haut: dernier.v },
    ...prev.map((p) => ({ date: p.date, bas: p[b], haut: p[hh] }))];
  const series = [{ nom: 'Prix observé', couleur, points: obs, fin: prev.length ? null : 'Dernier prix' }];
  if (prev.length) {
    series.push({
      nom: 'Prévision', couleur, pointille: true, fin: 'Prévu',
      points: [{ date: dernier.date, v: dernier.v, lien: true }, ...prev.map((p) => ({ date: p.date, v: p.v }))],
    });
  }
  graphiqueLignes(el, {
    hauteur: 340,
    series,
    bandes: prev.length ? [{ points: bande('b95', 'h95'), couleur, opacite: 0.12 },
      { points: bande('b80', 'h80'), couleur, opacite: 0.22 }] : [],
    repere: prev.length ? { date: dernier.date, texte: 'Dernier relevé' } : null,
    alertes: obs.map((p) => ({ date: p.date, niveau: p.niveau })),
    bulle: (d) => {
      const lignes = [];
      const p = prev.find((q) => +q.date === +d);
      if (p) {
        lignes.push({ nom: '80 % de chances entre', valeur: `${prix(p.b80)} et ${prix(p.h80)}` });
        lignes.push({ nom: '95 % de chances entre', valeur: `${prix(p.b95)} et ${prix(p.h95)}` });
      }
      const o = obs.find((q) => +q.date === +d);
      if (o && o.niveau) lignes.push({ nom: 'Niveau d’alerte', valeur: o.niveau });
      if (o && o.n === 0) lignes.push({ nom: 'Mois sans relevé, valeur interpolée' });
      return lignes;
    },
  });
  legende.replaceChildren();
  legendeNiveaux(legende, false);
}

function dessinerBarresRegions(c) {
  const el = document.getElementById('graph-regions');
  if (!pret(el, ['synthese_regions'])) return;
  const lignes = (D.regions().get(c.produit) || []).filter((r) => !vide(r.prix)).sort((a, b) => b.prix - a.prix);
  if (!lignes.length) {
    messageVide(el, 'Pas de prix régional récent pour ce produit.');
    return;
  }
  const w = largeur(el);
  const pasL = 24;
  const h = lignes.length * pasL + 8;
  const svg = svgDans(el, w, h);
  const lw = Math.min(largeurTexte(svg, lignes.map((r) => r.region)) + 10, Math.round(w * 0.38));
  const vw = largeurTexte(svg, lignes.map((r) => prix(r.prix)), 'opa-fort')
    + largeurTexte(svg, lignes.map((r) => pct(r.var_12m_pct))) + 22;
  const x = d3.scaleLinear([0, d3.max(lignes, (r) => r.prix)], [lw, Math.max(lw + 40, w - vw)]);
  const g = svg.append('g').selectAll('g').data(lignes).join('g')
    .attr('transform', (r, i) => `translate(0,${i * pasL + 4})`);
  g.append('text').attr('x', lw - 8).attr('y', pasL / 2 - 2).attr('dy', '0.32em').attr('text-anchor', 'end')
    .text((r) => r.region);
  g.append('rect').attr('x', lw).attr('y', 4).attr('height', pasL - 12).attr('rx', 3)
    .attr('width', (r) => Math.max(1, x(r.prix) - lw)).style('fill', (r) => couleurVariation(r.var_12m_pct))
    .style('stroke', 'var(--color-border-line)');
  g.append('text').attr('class', 'opa-fort').attr('x', (r) => x(r.prix) + 6).attr('y', pasL / 2 - 2)
    .attr('dy', '0.32em').text((r) => prix(r.prix));
  g.append('text').attr('x', w - 2).attr('y', pasL / 2 - 2).attr('dy', '0.32em').attr('text-anchor', 'end')
    .style('fill', (r) => (vide(r.var_12m_pct) || r.var_12m_pct === 0 ? null : r.var_12m_pct > 0 ? 'var(--color-bad)' : 'var(--color-ok)'))
    .text((r) => pct(r.var_12m_pct));
}

function dessinerLignesRegions(c) {
  const el = document.getElementById('graph-lignes-regions');
  if (!pret(el, ['series_regionales', 'series_nationales'])) return;
  const brut = (D.regionales().get(c.produit) || []).filter((p) => !vide(p.v));
  const nat = (D.nationales().get(c.produit) || []).filter((p) => !vide(p.v));
  if (!brut.length || !nat.length) {
    messageVide(el, 'Pas de série régionale pour ce produit.');
    return;
  }
  const debutPer = debutPeriode(nat[nat.length - 1].mois, c.periode);
  const debut = brut[0].mois > debutPer ? brut[0].mois : debutPer;
  const reg = grouper(brut.filter((p) => p.mois >= debut), (r) => r.region);
  const series = [...reg.entries()].map(([region, pts]) => ({ nom: region, points: pts }));
  series.push({ nom: 'Prix national', couleur: dash.colors[0], points: nat.filter((p) => p.mois >= debut), fin: 'National' });
  dessinerFaisceau(el, series, series.flatMap((s) => s.points));
}

/* Faisceau des régions (gris) sous la courbe nationale ; la bulle nomme la région la plus chère et la moins chère. */
function dessinerFaisceau(el, series, tous) {
  const w = largeur(el);
  const h = 260;
  const svg = svgDans(el, w, h);
  const bulle = bulleDe(el);
  cacherBulle(bulle);
  const y = d3.scaleLinear([d3.min(tous, (p) => p.v) * 0.95, d3.max(tous, (p) => p.v) * 1.05], [h - 24, 12]).nice(5);
  const ticksY = y.ticks(5);
  const ml = largeurTexte(svg, ticksY.map(prix)) + 10;
  const national = series[series.length - 1];
  const etiquette = `${national.fin} ${prix(national.points[national.points.length - 1].v)}`;
  const mr = largeurTexte(svg, [etiquette], 'opa-fort') + 12;
  const x = d3.scaleUtc(d3.extent(tous, (p) => p.date), [ml, w - mr]);
  svg.append('g').attr('class', 'opa-grille-y').selectAll('line').data(ticksY).join('line')
    .attr('x1', ml).attr('x2', w - mr).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
  svg.append('g').selectAll('text').data(ticksY).join('text').attr('x', ml - 8).attr('y', (d) => y(d))
    .attr('dy', '0.32em').attr('text-anchor', 'end').text(prix);
  const tx = ticksTemps(x, w - ml - mr);
  svg.append('g').selectAll('text').data(tx.valeurs).join('text').attr('x', (d) => x(d)).attr('y', h - 6)
    .attr('text-anchor', 'middle').text(tx.format);
  const ligne = d3.line().defined((p) => !vide(p.v)).x((p) => x(p.date)).y((p) => y(p.v));
  const chemins = svg.append('g').selectAll('path').data(series.slice(0, -1)).join('path').attr('class', 'opa-ligne')
    .attr('d', (s) => ligne(s.points)).style('stroke', 'var(--cds-chart-muted)').style('stroke-width', 1.2).style('opacity', 0.7);
  svg.append('path').attr('class', 'opa-ligne').attr('d', ligne(national.points))
    .style('stroke', national.couleur).style('stroke-width', 2.5);
  const der = national.points[national.points.length - 1];
  svg.append('circle').attr('cx', x(der.date)).attr('cy', y(der.v)).attr('r', 3).style('fill', national.couleur);
  svg.append('text').attr('class', 'opa-fort').attr('x', x(der.date) + 7).attr('y', y(der.v)).attr('dy', '0.32em').text(etiquette);
  const dates = Array.from(new Set(tous.map((p) => +p.date))).sort((a, b) => a - b).map((t) => new Date(t));
  const regle = svg.append('line').attr('class', 'opa-regle').attr('y1', 12).attr('y2', h - 24).style('opacity', 0);
  svg.append('rect').attr('x', ml).attr('y', 0).attr('width', Math.max(0, w - mr - ml)).attr('height', h)
    .style('fill', 'transparent')
    .on('pointermove', (event) => {
      const [sx] = d3.pointer(event, svg.node());
      const [bx, by] = d3.pointer(event, el);
      const d = dates[d3.bisector((t) => t).center(dates, x.invert(sx))];
      regle.attr('x1', x(d)).attr('x2', x(d)).style('opacity', 1);
      const valeurs = series.slice(0, -1).map((s) => ({ s, p: s.points.find((q) => +q.date === +d) }))
        .filter((v) => v.p && !vide(v.p.v)).sort((a, b) => b.p.v - a.p.v);
      const haut = valeurs[0];
      const basse = valeurs[valeurs.length - 1];
      chemins.style('stroke', (s) => (haut && s === haut.s ? 'var(--color-bad)' : basse && s === basse.s ? 'var(--color-ok)' : 'var(--cds-chart-muted)'))
        .style('opacity', (s) => ((haut && s === haut.s) || (basse && s === basse.s) ? 1 : 0.35));
      const n = national.points.find((q) => +q.date === +d);
      const lignes = [{ couleur: national.couleur, nom: 'National', valeur: n ? prix(n.v) : '—' }];
      if (haut) lignes.push({ couleur: 'var(--color-bad)', nom: `Plus cher : ${haut.s.nom}`, valeur: prix(haut.p.v) });
      if (basse && basse !== haut) lignes.push({ couleur: 'var(--color-ok)', nom: `Moins cher : ${basse.s.nom}`, valeur: prix(basse.p.v) });
      montrerBulle(bulle, el, bx, by, moisDate(d), lignes);
    })
    .on('pointerleave', () => {
      regle.style('opacity', 0);
      chemins.style('stroke', 'var(--cds-chart-muted)').style('opacity', 0.7);
      cacherBulle(bulle);
    });
}

function dessinerTests(c) {
  const el = document.getElementById('graph-tests');
  if (!pret(el, ['tests_previsions'])) return;
  const lignes = (D.tests().get(c.produit) || []).filter((r) => r.horizon === horizon);
  if (!lignes.length) {
    messageVide(el, 'Pas de prévision testée pour ce produit (série trop courte ou plus mise à jour).');
    return;
  }
  graphiqueLignes(el, {
    hauteur: 240,
    series: [
      { nom: 'Prix observé', couleur: dash.colors[0], points: lignes.map((r) => ({ date: r.date, v: r.reel })) },
      {
        nom: `Prévu ${horizon} mois avant`, couleur: dash.colors[1], pointille: true, marqueurs: true,
        points: lignes.map((r) => ({ date: r.date, v: r.prevu })),
      },
    ],
    bulle: (d) => {
      const r = lignes.find((q) => +q.date === +d);
      return r && r.reel ? [{ nom: 'Écart', valeur: pct((r.prevu / r.reel - 1) * 100) }] : [];
    },
  });
}

function dessinerModeles(c) {
  const table = document.getElementById('tableau-modeles');
  if (!etatTable(table, ['evaluation_modeles'])) return;
  const lignes = [...(D.evaluation().get(c.produit) || [])].sort((a, b) => a.mape_pct - b.mape_pct);
  table.tBodies[0].replaceChildren(...lignes.map((r) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-key', cle(r.produit_id, r.modele));
    if (r.retenu === 'oui') tr.classList.add('opa-choisi');
    cellule(tr, r.modele);
    cellule(tr, pctSimple(r.mape_pct));
    cellule(tr, prix(r.mae));
    cellule(tr, prix(r.rmse));
    cellule(tr, String(r.nb_tests));
    cellule(tr, r.retenu);
    return tr;
  }));
  if (!lignes.length) {
    const tr = document.createElement('tr');
    const td = cellule(tr, 'Série trop courte ou plus mise à jour : pas de prévision.');
    td.colSpan = 6;
    table.tBodies[0].append(tr);
  }
}

function sansAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function dessinerMarches(c) {
  const table = document.getElementById('tableau-marches');
  const videMsg = document.getElementById('marches-vide');
  if (!etatTable(table, ['marches'])) {
    videMsg.hidden = true;
    return;
  }
  const q = sansAccents(recherche.trim());
  const valeur = (r) => (tri.champ === 'alerte' ? (vide(r.alerte) ? -99 : r.alerte) : r[tri.champ]);
  const lignes = (D.marches().get(c.produit) || [])
    .filter((r) => !q || sansAccents(`${r.marche} ${r.region}`).includes(q))
    .sort((a, b) => {
      const va = valeur(a);
      const vb = valeur(b);
      if (vide(va)) return 1;
      if (vide(vb)) return -1;
      return (typeof va === 'string' ? va.localeCompare(vb, LOCALE) : va - vb) * tri.sens;
    });
  for (const b of document.querySelectorAll('#tableau-marches .opa-tri')) {
    b.setAttribute('aria-sort', b.dataset.tri === tri.champ ? (tri.sens > 0 ? 'ascending' : 'descending') : 'none');
  }
  table.tBodies[0].replaceChildren(...lignes.map((r) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-key', cle(r.region, r.marche, r.produit_id));
    cellule(tr, r.marche);
    cellule(tr, r.region);
    cellule(tr, prix(r.prix));
    cellule(tr, pct(r.var_1m_pct), classeVariation(r.var_1m_pct));
    cellule(tr, pct(r.var_12m_pct), classeVariation(r.var_12m_pct));
    celluleNiveau(tr, r.niveau);
    cellule(tr, fmtMoisAn.format(dateMois(r.mois)));
    return tr;
  }));
  videMsg.hidden = lignes.length > 0 || !q;
}

// ---------- page « Méthode » ----------
function dessinerMethode() {
  const table = document.getElementById('tableau-couverture');
  if (!etatTable(table, ['synthese_produits'])) return;
  const lignes = [...D.synthese()].sort(ordreProduit);
  table.tBodies[0].replaceChildren(...lignes.map((r) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-key', cle(r.produit_id));
    cellule(tr, r.produit);
    cellule(tr, r.variete);
    cellule(tr, moisLong(r.mois));
    cellule(tr, String(r.nb_marches));
    cellule(tr, r.modele || 'aucun (série trop courte)');
    return tr;
  }));
}

// ---------- dessin d'ensemble ----------
function dessiner() {
  const c = choix();
  dessinerFiltres(c);
  remplir('resume_senegal', (D.resume() || [])[0], null, document.getElementById('entete'));
  dessinerResume();
  if (page === 'ensemble') dessinerEnsemble(c);
  if (page === 'produit') dessinerProduit(c);
  if (page === 'methode') dessinerMethode();
}

afficherPage();
dash.onData(dessiner);
if (page !== 'ensemble') document.getElementById(page).scrollIntoView();
