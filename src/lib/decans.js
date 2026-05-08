// Egyptian transit dekans — Seti I-B list, sourced from Rosemary Clark,
// "The Sacred Magic of Ancient Egypt," Table 12 (pp. 108-109), with
// expanded mythic synthesis and Hermetic Icons (Liber Hermetis / Agrippa
// II.37) loaded from Decans/egyptian_transit_dekans.xlsx.
//
// All 36 dekans use sidereal (Fagan-Allen) C.E. 2000 positions, matching
// the rest of this app. Each dekan spans 10° of the ecliptic. Precession
// from C.E. 2000 to the present is well below 1°, far smaller than the
// 10° dekan width — so we use these positions directly.
//
// The cycle's seam falls at 9°15′ Gemini (start of dekan 36, Uayret),
// returning to Sopdet's threshold at dekan 1 (Tepy a Sopdet) at 19°15′
// Gemini.

export const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const SIGN_INDEX = Object.fromEntries(SIGNS.map((s, i) => [s, i]));

function abs(sign, deg, min) {
  return SIGN_INDEX[sign] * 30 + deg + min / 60;
}

export const DEKANS = [
  { num: 1, sign: 'Gemini', deg: 19, min: 15, name: 'Tepy a Sopdet', meaning: `Forerunner of Sirius ("She who precedes Sopdet")`, story: `The herald-star that rises just before Sirius itself, announcing Sopdet's return after 70 days of invisibility in the Duat. In funerary texts the deceased follows Tepy a Sopdet to be reborn at the eastern horizon.`, hermetic: `Gemini 3rd decan — A man clothed in mail, holding a bow and arrows. (Audacity, malice, strife.)` },
  { num: 2, sign: 'Gemini', deg: 29, min: 15, name: 'Sopdet', meaning: `Sirius / Sothis (the star itself, lit. "Sharp One")`, story: `Sirius personified as the goddess Sothis, consort of Sah/Orion and mother of Horus-Soped. Her heliacal rising at dawn after 70 days underground heralds the Nile flood — the master myth of stellar resurrection. Pyramid Text 442: 'Osiris comes as Orion, Isis comes as Sothis.'`, hermetic: `Cancer 1st decan — A young virgin clothed in white, holding a garland. (Subtlety of senses, love, joy. ※ This is Isis-Sothis preserved in the Hermetic tradition.)` },
  { num: 3, sign: 'Cancer', deg: 9, min: 15, name: 'Anher Maat Tchai', meaning: `Onuris of the True Wind (?)`, story: `Possibly contains Anhur (Onuris), 'the one who brings back the distant goddess' — the hunter-warrior god who retrieves the wandering Eye of Ra from the southern desert. If so, this dekan inherits the myth of the soul's return from exile.`, hermetic: `Cancer 2nd decan — A man riding a horse, holding a fig in his hand, in fair garments. (Riches, wisdom, the auspicious marriage.)` },
  { num: 4, sign: 'Cancer', deg: 19, min: 15, name: 'Shetu', meaning: `The Hidden One (also "Tortoise")`, story: `A spirit of concealment, possibly tortoise-form. In Egyptian astronomy 'the hidden ones' refer to stars beneath the horizon during their 70-day Duat purification.`, hermetic: `Cancer 3rd decan — A swift-running man, with a viper in his hand and a hammer at his side. (Running, audacity, swiftness.)` },
  { num: 5, sign: 'Cancer', deg: 29, min: 15, name: 'Djeriu Khepti', meaning: `Limits of Khepri (?)`, story: `The boundary stars of Khepri, the scarab who pushes the morning sun out of the underworld at dawn. Stands at the threshold between night and day — the moment of cosmic emergence.`, hermetic: `Leo 1st decan — A man riding upon a lion. (Boldness, violence, dominion, cruelty.)` },
  { num: 6, sign: 'Leo', deg: 9, min: 15, name: 'Ha Djat', meaning: `Back of the Body`, story: `One of a triad (with Pehui Djat) marking parts of an unnamed celestial figure's body, likely Sah/Orion. Egyptian sky-mythology read constellations as the giant body-parts of cosmic beings.`, hermetic: `Leo 2nd decan — A crowned man holding a whip. (Loftiness, courage, fame.)` },
  { num: 7, sign: 'Leo', deg: 19, min: 15, name: 'Pehui Djat', meaning: `Rear of the Body`, story: `The lower body of the same celestial figure as Ha Djat. The deceased could enter the Duat by 'the rear of the body' of a sky-god — ritual geography mapped onto the cosmography of the heavens.`, hermetic: `Leo 3rd decan — A young man with a whip; or a miserable man weeping. (Love, society, the wickedness of women.)` },
  { num: 8, sign: 'Leo', deg: 29, min: 15, name: 'Themat Khert', meaning: `She Who is Below ("Lower Themat")`, story: `A 'lower' or chthonic goddess-form, possibly an aspect of Nut or one of her dekan-children whose 70-day Duat phase is being marked.`, hermetic: `Virgo 1st decan — A virgin holding two ears of corn, dressing the head of a child. (Gain, scraping together of wealth, the harvest.)` },
  { num: 9, sign: 'Virgo', deg: 9, min: 15, name: 'Uashati Bekati', meaning: `The Powerful Bekati (?)`, story: `Largely lost. Bekati appears in some lists as a stellar protector but no surviving myth is attached.`, hermetic: `Virgo 2nd decan — A black man clothed in skin, holding a bag. (Wealth, gain through service.)` },
  { num: 10, sign: 'Virgo', deg: 19, min: 15, name: 'Ipset', meaning: `Of Ipet (Hippopotamus goddess) (?)`, story: `Possibly relates to Ipet/Ipy, the great hippopotamus goddess of the Theban sky — what we now call the constellation Draco. Ipet protected the king's rebirth; her temple stood at Karnak.`, hermetic: `Virgo 3rd decan — A white woman, deaf, infirm, sitting. (Weakness, infirmities, infamy.)` },
  { num: 11, sign: 'Virgo', deg: 29, min: 15, name: 'Sebshesen', meaning: `Star of the Lotus`, story: `The lotus is the flower from which Ra was born at the first sunrise, emerging from the primordial waters of Nun. This dekan participates in the creation-emergence myth.`, hermetic: `Libra 1st decan — A man holding in one hand a spear, in the other a bird. (Justice, truth, good judgment.)` },
  { num: 12, sign: 'Libra', deg: 9, min: 15, name: 'Tepy Khent', meaning: `Foremost of the Front`, story: `A leader-star of a celestial body or barque, possibly its prow — the cutting edge of cosmic motion through the night.`, hermetic: `Libra 2nd decan — Two furious wrathful men; a man sitting on a chair. (Indignation against the wicked.)` },
  { num: 13, sign: 'Libra', deg: 19, min: 15, name: 'Khent Hert', meaning: `Upper Forepart`, story: `The upper portion of the same celestial body as Tepy Khent. Together with Imseti em Ibu (next), part of an Anubis-canine cluster (Khentamentiu, 'Foremost of the Westerners,' was Anubis's title).`, hermetic: `Libra 3rd decan — A violent man with a bow and arrow. (Evil works, lewdness.)` },
  { num: 14, sign: 'Libra', deg: 29, min: 15, name: 'Imseti em Ibu', meaning: `Imseti in Ibu (Son of Horus, "in the Place of Purification")`, story: `Imseti is one of the four sons of Horus, guardian of the canopic jar containing the liver, protector of the south. 'Em Ibu' places him 'in the Place of Purification' — a stage in embalming that is also a cosmic location in the Duat.`, hermetic: `Scorpio 1st decan — A woman of good face and habit, with two men striking her. (Comeliness of body, contention, treachery.)` },
  { num: 15, sign: 'Scorpio', deg: 9, min: 15, name: 'Temes en Khent', meaning: `Binding of the Front (?)`, story: `Largely lost. 'Temes' can refer to a binding cloth or burial wrapping — possibly tied to the embalming/Imseti cluster preceding it.`, hermetic: `Scorpio 2nd decan — A naked man, a naked woman, a man sitting on the earth, two dogs biting each other. (Passion, deceit, ruin.)` },
  { num: 16, sign: 'Scorpio', deg: 19, min: 15, name: 'Sapeti Khenui', meaning: `Two Lips of the Rowers (?)`, story: `Lost in any extant mythology. The name suggests 'two lips of the rowers' — perhaps figures at the prow of the solar barque.`, hermetic: `Scorpio 3rd decan — A man bowing his head, a man with a serpent. (Drunkenness, fornication, wrath, violence, strife.)` },
  { num: 17, sign: 'Scorpio', deg: 29, min: 15, name: 'Hery Ib Wia', meaning: `He Who is in the Middle of the Barque`, story: `The deity at the center of the solar barque of Ra. In the Amduat and Book of Gates, Ra travels through 12 hours of night accompanied by Sia (Perception), Hu (Utterance), Heka (Magic), and Ma'at. Hery Ib Wia is one of the inner crew.`, hermetic: `Sagittarius 1st decan — A man armed in mail, holding a sword. (Audacity, malice, liberty.)` },
  { num: 18, sign: 'Sagittarius', deg: 9, min: 15, name: 'Shesmu', meaning: `Shesmu (Lord of the Winepress / Oil-Press)`, story: `A major god — lord of the wine-press and oil-press. In the Pyramid Texts (Utterances 273-274, the 'Cannibal Hymn'), Shesmu is a fierce executioner who butchers enemies of the pharaoh and serves their flesh. In later tradition he becomes lord of perfumes, red oil, and unguents.`, hermetic: `Sagittarius 2nd decan — A weeping woman, covered in clothes. (Sadness, fear concerning the body.)` },
  { num: 19, sign: 'Sagittarius', deg: 19, min: 15, name: 'Kenmut', meaning: `The Dark One ("Dark Cow")`, story: `A celestial bovine-goddess, 'the dark cow' — an aspect of Hathor or Mehet-Weret, the cosmic cow whose body is the night sky and whose milk is the Milky Way.`, hermetic: `Sagittarius 3rd decan — A yellow-colored man riding a yellow horse, holding a hawk. (Heedlessness in matters of profit.)` },
  { num: 20, sign: 'Sagittarius', deg: 29, min: 15, name: 'Tepy Asmad', meaning: `First of the Binding`, story: `Initiates the 'binding/yoke' sequence with Smad. Ritual binding of Apep, the chaos-serpent, was a nightly priestly office to ensure the sun's safe passage through the Duat.`, hermetic: `Capricorn 1st decan — A woman; a man carrying full bags. (Going forth, rejoicing in fields.)` },
  { num: 21, sign: 'Capricorn', deg: 9, min: 15, name: 'Smad', meaning: `The Binding / The Yoke`, story: `The act of binding chaos itself. Each night, priests of Ra ritually bound Apep in cords (the Book of Overthrowing Apep, P. Bremner-Rhind) to keep the cosmos in order.`, hermetic: `Capricorn 2nd decan — A man holding a book, opening and shutting it. (The recovery of things lost.)` },
  { num: 22, sign: 'Capricorn', deg: 19, min: 15, name: 'Sert', meaning: `Sheep / Ewe (also read as "Goose")`, story: `If 'goose,' the Great Cackler whose primordial egg cracked open to release the sun (a Hermopolitan creation myth). If 'ewe,' tied to Banebdjedet, the ram-god of Mendes — the soul of Osiris in animal form.`, hermetic: `Capricorn 3rd decan — A chaste woman; a wise master holding a book. (Wealth and the gathering of goods.)` },
  { num: 23, sign: 'Capricorn', deg: 29, min: 15, name: 'Sa Sert', meaning: `Son of Sert`, story: `The progeny in the Sert mythic line — generational continuation of the creation/sheep-or-goose lineage.`, hermetic: `Aquarius 1st decan — A prudent man; a woman spinning. (Meditation on wisdom, gain through industry.)` },
  { num: 24, sign: 'Aquarius', deg: 9, min: 15, name: 'Khery Kheped Sert', meaning: `He Who is Under the Thigh of Sert`, story: `A subordinate position 'under the thigh' of Sert. The 'Thigh' (Kheped/Khepesh) is the Egyptian name for the constellation we call the Big Dipper — Mesketiu, the bull's foreleg of Set, ritually severed and chained at the northern sky to keep Set bound forever.`, hermetic: `Aquarius 2nd decan — A man with a long beard. (Understanding, meekness, modesty, liberty.)` },
  { num: 25, sign: 'Aquarius', deg: 19, min: 15, name: 'Tepy Aakhui', meaning: `First of the Two Akh-Spirits`, story: `The 'akh' is the transfigured spirit of one who has successfully passed through the Duat. The Two Akhu form a paired star-spirit witnessing or escorting transfiguration.`, hermetic: `Aquarius 3rd decan — A black peevish man, holding aside an ear or scratching his head. (Drunkenness, evil, hatred.)` },
  { num: 26, sign: 'Aquarius', deg: 29, min: 15, name: 'Aakhui', meaning: `The Two Horizon Spirits ("Two Akhu")`, story: `The horizon (akhet) is where rebirth occurs each dawn. This dekan personifies the act of stellar transfiguration itself — becoming a star.`, hermetic: `Pisces 1st decan — A man carrying burdens on his shoulder, well-clothed. (Journeying, change of place, pursuit of riches.)` },
  { num: 27, sign: 'Pisces', deg: 9, min: 15, name: 'Tepy Abaui', meaning: `First of the Two Abas`, story: `First of the Two Abas — possibly relating to the Aba-place, an underworld region or chamber.`, hermetic: `Pisces 2nd decan — A great-bodied man in flame-colored garments, holding a piece of burning wood. (Ambition, gain, wickedness.)` },
  { num: 28, sign: 'Pisces', deg: 19, min: 15, name: 'Baui', meaning: `The Two Souls ("Two Bas")`, story: `The 'ba' is the mobile soul-aspect, shown as a bird with a human head. The Two Bas can refer to Ra and Osiris — the dual soul of the cosmos, sun and dead king united at the moment of midnight conjunction.`, hermetic: `Pisces 3rd decan — A naked man or youth, with a hare and a falcon. (Quietness, security, struggle against evil-doers.)` },
  { num: 29, sign: 'Pisces', deg: 29, min: 15, name: 'Khentu Heru', meaning: `Foremost of Horus`, story: `Stars that go before Horus, the falcon-god of kingship and the sky. These guide his daily flight across the heavens.`, hermetic: `Aries 1st decan — A black man with red eyes, of great stature, clothed in white, fierce. (Boldness, fierceness — the cardinal beginning.)` },
  { num: 30, sign: 'Aries', deg: 9, min: 15, name: 'Khentu Djeru', meaning: `Foremost of the Boundary`, story: `Stars at the cosmic boundary — the edge between order (Ma'at) and chaos (Isfet). Liminal sentinels.`, hermetic: `Aries 2nd decan — A green-clothed woman, lacking one leg, with iron crown. (Nobility mixed with fear.)` },
  { num: 31, sign: 'Aries', deg: 19, min: 15, name: 'Saui', meaning: `The Two Protections`, story: `A protective star-pair. 'Sa' is the hieroglyph for protection itself — the rolled-up shepherd's shelter, an apotropaic sign worn on amulets.`, hermetic: `Aries 3rd decan — A restless man in white, holding a golden bracelet. (Wit and subtlety; audacity in evil deeds.)` },
  { num: 32, sign: 'Aries', deg: 29, min: 15, name: 'Khau', meaning: `Risings / Glorious Appearances`, story: `The very act of stellar appearance personified — what every dekan does at its rising, made into a dekan of its own. 'Khau' is also the word for royal coronations and divine epiphanies.`, hermetic: `Taurus 1st decan — A naked man, an archer or husbandman, going forth to sow. (Knowledge of agriculture, geometry, the work of earth.)` },
  { num: 33, sign: 'Taurus', deg: 9, min: 15, name: 'Ayret', meaning: `The Uraeus (Rearing Cobra Goddess)`, story: `The rearing cobra at the brow of Ra, identified with the goddess Wadjet. The Uraeus is the fire-spitting protector of the king and of the sun's eye — the most potent apotropaic image in Egyptian religion.`, hermetic: `Taurus 2nd decan — A naked man holding a key. (Power, nobility, dominion over peoples.)` },
  { num: 34, sign: 'Taurus', deg: 19, min: 15, name: 'Remen Hery', meaning: `Upper Arm / Shoulder`, story: `The shoulder/upper arm of a celestial figure. The constellation we call the Big Dipper was the 'Foreleg' (Mesketiu) — the shoulder of the sky-bull.`, hermetic: `Taurus 3rd decan — A man with a serpent in one hand and a dart in the other. (Debauchery and audacity.)` },
  { num: 35, sign: 'Taurus', deg: 29, min: 15, name: 'Djes Uayrek', meaning: `Limb of Separation (?)`, story: `Largely lost. Possibly 'limb of separation' — relating to the dismemberment of Osiris or the severing of Set's foreleg at the northern sky.`, hermetic: `Gemini 1st decan — A man with a rod, in his hand a serpent. (The art of writing, calculations, the sciences.)` },
  { num: 36, sign: 'Gemini', deg: 9, min: 15, name: 'Uayret', meaning: `The Great Female One`, story: `A great goddess-aspect that completes the cycle and returns us to Sopdet's threshold. The year ends in a feminine plenitude that gives birth to the new year's Tepy a Sopdet.`, hermetic: `Gemini 2nd decan — A man digging the earth, with an eagle or vulture nearby. (Infamy, pride, contempt.)` },
];

const DEKAN_STARTS = DEKANS.map(d => abs(d.sign, d.deg, d.min));

function normalize(lon) {
  return ((lon % 360) + 360) % 360;
}

// Given a sidereal ecliptic longitude (0-360°, Fagan-Allen), return the
// active dekan. Each dekan spans 10° starting at its tabulated position;
// dekan 29 wraps Pisces → Aries.
export function getDekan(siderealLongitude) {
  const lon = normalize(siderealLongitude);
  for (let i = 0; i < DEKANS.length; i++) {
    const start = DEKAN_STARTS[i];
    const end = start + 10;
    if (end <= 360) {
      if (lon >= start && lon < end) return DEKANS[i];
    } else {
      if (lon >= start || lon < end - 360) return DEKANS[i];
    }
  }
  return null;
}

export function positionToLongitude(pos) {
  if (!pos || !pos.sign) return null;
  return abs(pos.sign, pos.degree || 0, pos.minute || 0);
}

export function getDekanForPosition(pos) {
  const lon = positionToLongitude(pos);
  if (lon == null) return null;
  return getDekan(lon);
}

export function formatDekanStart(d) {
  return `${d.deg}°${String(d.min).padStart(2, '0')}′ ${d.sign}`;
}
