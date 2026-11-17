/* Version autonome du tableau de bord, pour GitHub Pages.
   Dans Claude, index.html et app.js tournent dans l'environnement des tableaux de bord, qui fournit l'objet
   `dash` (jeux de données, calculs, filtres gardés dans l'adresse). Ce fichier recrée la partie de `dash`
   dont app.js a besoin en lisant les fichiers de data/processed/ : index.html et app.js restent identiques
   à ceux du tableau de bord publié dans Claude. */
(() => {
  const ICI = new URL('.', document.currentScript.src);
  const DONNEES = new URL('../data/processed/', ICI);
  const JEUX_CSV = [
    'indice_alimentaire', 'synthese_produits', 'series_nationales', 'previsions', 'evaluation_modeles',
    'tests_previsions', 'series_regionales', 'synthese_regions', 'marches',
  ];
  const JEUX_JSON = ['carte_regions', 'carte_pays'];

  const etats = new Map();
  const calculs = new Map();
  const abonnes = [];
  let redessinPrevu = false;

  // Un seul redessin pour plusieurs changements rapprochés (fichiers qui arrivent, filtres).
  function prevenir() {
    if (redessinPrevu) return;
    redessinPrevu = true;
    requestAnimationFrame(() => {
      redessinPrevu = false;
      for (const f of abonnes) f();
    });
  }

  // Un calcul rend le même tableau tant que ses entrées n'ont pas changé : app.js s'en sert pour sa mémoire.
  function calculer(id) {
    const c = calculs.get(id);
    const entrees = c.inputs.map((i) => window.dash.data(i));
    const attente = entrees.find((e) => e.status !== 'ok');
    if (attente) return { status: attente.status === 'loading' ? 'loading' : 'error', data: null };
    const donnees = entrees.map((e) => e.data);
    if (!c.resultat || donnees.some((d, i) => d !== c.entrees[i])) {
      c.entrees = donnees;
      try {
        c.resultat = { status: 'ok', data: c.fn(...donnees) };
      } catch (e) {
        console.error(`Calcul ${id}`, e);
        c.resultat = { status: 'error', data: null };
      }
    }
    return c.resultat;
  }

  function adresse(params, lien) {
    const q = new URLSearchParams(params).toString();
    return `${location.pathname}${q ? `?${q}` : ''}${lien ? `#${lien}` : ''}`;
  }

  window.dash = {
    colors: ['var(--opa-serie-1)', 'var(--opa-serie-2)', 'var(--opa-serie-3)', 'var(--opa-serie-4)'],
    data: (id) => (calculs.has(id) ? calculer(id) : etats.get(id) || { status: 'missing', data: null }),
    calc: (id, def) => calculs.set(id, { inputs: def.inputs, fn: def.fn, entrees: [], resultat: null }),
    onData: (f) => {
      abonnes.push(f);
      f();
    },
    params: () => Object.fromEntries(new URLSearchParams(location.search)),
    setParams: (changements) => {
      const p = window.dash.params();
      for (const [k, v] of Object.entries(changements)) {
        if (v === null || v === undefined || v === '') delete p[k];
        else p[k] = String(v);
      }
      history.replaceState(null, '', adresse(p, location.hash.slice(1)));
      prevenir();
    },
    setLink: (nom) => history.replaceState(null, '', adresse(window.dash.params(), nom)),
  };

  async function charger(id, json) {
    const fichier = `${id}.${json ? 'json' : 'csv'}`;
    try {
      const r = await fetch(new URL(fichier, DONNEES));
      if (!r.ok) throw new Error(`${fichier} : erreur ${r.status}`);
      const texte = await r.text();
      etats.set(id, { status: 'ok', data: json ? JSON.parse(texte) : d3.csvParse(texte) });
    } catch (e) {
      console.error(e);
      etats.set(id, { status: 'error', data: null });
    }
    prevenir();
  }

  // La page de Claude (index.html) est insérée telle quelle, sans sa balise de script, puis app.js est chargé.
  async function demarrer() {
    const racine = document.getElementById('page');
    for (const id of [...JEUX_CSV, ...JEUX_JSON]) etats.set(id, { status: 'loading', data: null });
    try {
      const r = await fetch(new URL('index.html', ICI));
      if (!r.ok) throw new Error(`index.html : erreur ${r.status}`);
      racine.innerHTML = (await r.text()).replace(/<script\b[^>]*\bsrc=["']?app\.js["']?[^>]*>\s*<\/script>/i, '');
    } catch (e) {
      console.error(e);
      racine.textContent = 'Le tableau de bord n’a pas pu être chargé. Rechargez la page.';
      return;
    }
    for (const id of JEUX_CSV) charger(id, false);
    for (const id of JEUX_JSON) charger(id, true);
    const script = document.createElement('script');
    script.src = new URL('app.js', ICI).href;
    document.body.append(script);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
