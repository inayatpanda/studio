var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// studio-app/core/domain.js
var domain_exports = {};
__export(domain_exports, {
  GH_PAGES_A: () => GH_PAGES_A,
  cnameFileContent: () => cnameFileContent,
  dnsRecordsFor: () => dnsRecordsFor,
  isApex: () => isApex,
  isValidDomain: () => isValidDomain,
  normaliseDomain: () => normaliseDomain,
  pagesDomainStatus: () => pagesDomainStatus
});
function normaliseDomain(input) {
  let s = String(input || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.replace(/[/?#].*$/, "");
  s = s.replace(/:\d+$/, "");
  s = s.replace(/\.$/, "");
  return s;
}
function isValidDomain(input) {
  const s = normaliseDomain(input);
  if (!s || s.length > 253) return false;
  const labels = s.split(".");
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];
  if (!/^[a-z][a-z0-9-]*$/.test(tld) || tld.length < 2) return false;
  const labelRe = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
  return labels.every((l) => labelRe.test(l));
}
function isApex(input) {
  const s = normaliseDomain(input);
  return isValidDomain(s) && s.split(".").length === 2;
}
function cnameFileContent(input) {
  const s = normaliseDomain(input);
  if (!isValidDomain(s)) throw new Error("Enter a valid domain, e.g. example.com");
  return s + "\n";
}
var GH_PAGES_A = ["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"];
function dnsRecordsFor(input, ghUser) {
  const s = normaliseDomain(input);
  if (!isValidDomain(s)) return [];
  const user = String(ghUser || "").trim().toLowerCase();
  const target = user ? `${user}.github.io` : "<your-user>.github.io";
  const labels = s.split(".");
  if (labels.length === 2) {
    const rows = GH_PAGES_A.map((ip) => ({ type: "A", host: "@", value: ip, note: "GitHub Pages" }));
    rows.push({ type: "CNAME", host: "www", value: target, note: "so www also works" });
    return rows;
  }
  const sub = labels.slice(0, labels.length - 2).join(".") || labels[0];
  return [{ type: "CNAME", host: sub, value: target, note: "GitHub Pages" }];
}
function pagesDomainStatus(pages, expectedInput) {
  const host = normaliseDomain(expectedInput);
  const cname = pages && pages.cname ? normaliseDomain(pages.cname) : "";
  const built = !!(pages && pages.status === "built");
  const httpsEnforced = !!(pages && pages.https_enforced);
  const cert = pages && pages.https_certificate;
  const certState = cert && cert.state ? String(cert.state) : "";
  const certReady = certState === "approved";
  const configured = !!cname;
  const matches = configured && !!host && cname === host;
  let message;
  if (!pages) {
    message = "GitHub Pages isn't reporting a site yet \u2014 publish once (or wait a moment after enabling Pages), then check again.";
  } else if (!configured) {
    message = 'No custom domain is set on GitHub yet. Add the DNS records above, press "Connect this domain", then check again in a few minutes.';
  } else if (host && !matches) {
    message = `GitHub currently has a different domain set (${cname}). Press "Connect this domain" again to switch it to ${host}.`;
  } else {
    const shown = host || cname;
    if (certReady && httpsEnforced) message = `${shown} is verified and live over HTTPS \u2713`;
    else if (certReady) message = `${shown} is verified and its HTTPS certificate is ready \u2713`;
    else message = `${shown} is set on GitHub. It's still provisioning the free HTTPS certificate \u2014 this can take a few minutes, up to an hour the first time. Check again shortly.`;
  }
  const ok = matches || configured && !host;
  return { configured, matches, cname, built, httpsEnforced, certState, certReady, ok, message };
}

// studio-app/core/tour.js
var tour_exports = {};
__export(tour_exports, {
  TOUR_DONE_KEY: () => TOUR_DONE_KEY,
  TOUR_PENDING_KEY: () => TOUR_PENDING_KEY,
  TOUR_STEPS: () => TOUR_STEPS,
  clampStep: () => clampStep,
  clearPending: () => clearPending,
  isDone: () => isDone,
  isLastStep: () => isLastStep,
  isPending: () => isPending,
  markDone: () => markDone,
  markPending: () => markPending,
  resetTour: () => resetTour,
  shouldAutoOpen: () => shouldAutoOpen,
  tourStepAt: () => tourStepAt,
  tourStepCount: () => tourStepCount
});
var TOUR_STEPS = [
  {
    id: "template",
    section: "write",
    title: "Pick a template",
    body: "Open Write \u2192 New post and choose a starting template. It gives your first post a shape you can edit."
  },
  {
    id: "write",
    section: "write",
    title: "Write your post",
    body: "Type in the editor \u2014 a title and a few paragraphs is plenty. Everything saves to a draft as you go."
  },
  {
    id: "image",
    section: "media",
    title: "Add an image",
    body: "Use an image block (or the Darkroom) to drop in a photo. Images commit to your GitHub repo \u2014 free, no extra setup."
  },
  {
    id: "interactive",
    section: "write",
    title: "Make it interactive",
    body: "Tap \u2726 Interactive to drop in a poll, quiz, chart or timeline \u2014 pick a template, set a title, done. Or sketch a flipbook in \u25C6 Figure \u2192 Draw."
  },
  {
    id: "publish",
    section: "posts",
    title: "Publish",
    body: "Happy with it? Publish. Your post commits to your repo and GitHub Pages rebuilds your blog automatically."
  }
];
var TOUR_DONE_KEY = "helm.studio.firstPostTour.done";
var TOUR_PENDING_KEY = "helm.studio.firstPostTour.pending";
var browserStore = typeof localStorage !== "undefined" ? {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
    }
  },
  remove: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
    }
  }
} : null;
var S = (store) => store || browserStore;
function tourStepCount() {
  return TOUR_STEPS.length;
}
function clampStep(i) {
  i = Number(i);
  if (!Number.isFinite(i) || i < 0) return 0;
  const max = TOUR_STEPS.length - 1;
  return i > max ? max : Math.floor(i);
}
function tourStepAt(i) {
  return TOUR_STEPS[clampStep(i)] || null;
}
function isLastStep(i) {
  return clampStep(i) === TOUR_STEPS.length - 1;
}
function markPending(store) {
  const s = S(store);
  if (s) s.set(TOUR_PENDING_KEY, "1");
}
function clearPending(store) {
  const s = S(store);
  if (s) s.remove(TOUR_PENDING_KEY);
}
function isPending(store) {
  const s = S(store);
  return !!(s && s.get(TOUR_PENDING_KEY));
}
function markDone(store) {
  const s = S(store);
  if (s) {
    s.set(TOUR_DONE_KEY, "1");
    s.remove(TOUR_PENDING_KEY);
  }
}
function isDone(store) {
  const s = S(store);
  return !!(s && s.get(TOUR_DONE_KEY));
}
function resetTour(store) {
  const s = S(store);
  if (s) {
    s.remove(TOUR_DONE_KEY);
    s.remove(TOUR_PENDING_KEY);
  }
}
function shouldAutoOpen(store) {
  return isPending(store) && !isDone(store);
}

// studio-app/core/quotes.js
var quotes_exports = {};
__export(quotes_exports, {
  QUOTES: () => QUOTES,
  TONES: () => TONES,
  authorFacets: () => authorFacets,
  filterQuotes: () => filterQuotes,
  formatAttribution: () => formatAttribution,
  quoteForInsert: () => quoteForInsert,
  themeFacets: () => themeFacets,
  toneFacets: () => toneFacets
});

// studio-app/data/quotes.json
var quotes_default = {
  version: 1,
  note: "Curated public-domain / widely-attributed quotations for the Studio Quote Library. Every author is long-deceased (text in the public domain) or the line is a widely-attributed aphorism. No modern copyrighted lyrics or book passages. themes: Life, Love, Work & ambition, Creativity & art, Science & knowledge, Failure & resilience, Time, Nature, Wisdom, Humour, Freedom, Courage. tone: inspiring, wry, reflective, defiant, tender.",
  quotes: [
    { text: "The unexamined life is not worth living.", author: "Socrates", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "I know that I know nothing.", author: "Socrates", themes: ["Wisdom", "Science & knowledge"], tone: "reflective" },
    { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotle", themes: ["Work & ambition", "Wisdom"], tone: "inspiring" },
    { text: "Knowing yourself is the beginning of all wisdom.", author: "Aristotle", themes: ["Wisdom"], tone: "reflective" },
    { text: "It is the mark of an educated mind to be able to entertain a thought without accepting it.", author: "Aristotle", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "No man ever steps in the same river twice, for it is not the same river and he is not the same man.", author: "Heraclitus", themes: ["Time", "Wisdom", "Nature"], tone: "reflective" },
    { text: "The only thing we know is that we know nothing, and that is the highest flight of human wisdom.", author: "Leo Tolstoy", themes: ["Wisdom", "Science & knowledge"], tone: "reflective", source: "War and Peace" },
    { text: "Everyone thinks of changing the world, but no one thinks of changing himself.", author: "Leo Tolstoy", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "If you want to be happy, be.", author: "Leo Tolstoy", themes: ["Life", "Wisdom"], tone: "wry" },
    { text: "The two most powerful warriors are patience and time.", author: "Leo Tolstoy", themes: ["Time", "Wisdom"], tone: "reflective", source: "War and Peace" },
    { text: "Waste no more time arguing about what a good man should be. Be one.", author: "Marcus Aurelius", themes: ["Life", "Wisdom"], tone: "defiant", source: "Meditations" },
    { text: "You have power over your mind \u2014 not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius", themes: ["Failure & resilience", "Wisdom"], tone: "defiant", source: "Meditations" },
    { text: "The happiness of your life depends upon the quality of your thoughts.", author: "Marcus Aurelius", themes: ["Life", "Wisdom"], tone: "reflective", source: "Meditations" },
    { text: "When you arise in the morning, think of what a precious privilege it is to be alive \u2014 to breathe, to think, to enjoy, to love.", author: "Marcus Aurelius", themes: ["Life", "Time"], tone: "tender", source: "Meditations" },
    { text: "We suffer more often in imagination than in reality.", author: "Seneca", themes: ["Wisdom", "Failure & resilience"], tone: "reflective" },
    { text: "Luck is what happens when preparation meets opportunity.", author: "Seneca", themes: ["Work & ambition", "Wisdom"], tone: "inspiring" },
    { text: "It is not that we have a short time to live, but that we waste a lot of it.", author: "Seneca", themes: ["Time", "Life"], tone: "reflective", source: "On the Shortness of Life" },
    { text: "Difficulties strengthen the mind, as labour does the body.", author: "Seneca", themes: ["Failure & resilience", "Work & ambition"], tone: "inspiring" },
    { text: "While we wait for life, life passes.", author: "Seneca", themes: ["Time", "Life"], tone: "reflective" },
    { text: "Begin at once to live, and count each separate day as a separate life.", author: "Seneca", themes: ["Life", "Time"], tone: "inspiring" },
    { text: "No great thing is created suddenly, any more than a bunch of grapes or a fig.", author: "Epictetus", themes: ["Time", "Work & ambition", "Nature"], tone: "reflective" },
    { text: "It's not what happens to you, but how you react to it that matters.", author: "Epictetus", themes: ["Failure & resilience", "Wisdom"], tone: "defiant" },
    { text: "Wealth consists not in having great possessions, but in having few wants.", author: "Epictetus", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "He who is not contented with what he has, would not be contented with what he would like to have.", author: "Socrates", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "The journey of a thousand miles begins with a single step.", author: "Lao Tzu", themes: ["Work & ambition", "Wisdom"], tone: "inspiring", source: "Tao Te Ching" },
    { text: "Nature does not hurry, yet everything is accomplished.", author: "Lao Tzu", themes: ["Nature", "Time", "Wisdom"], tone: "reflective", source: "Tao Te Ching" },
    { text: "When I let go of what I am, I become what I might be.", author: "Lao Tzu", themes: ["Life", "Wisdom"], tone: "reflective", source: "Tao Te Ching" },
    { text: "Knowing others is wisdom; knowing yourself is enlightenment.", author: "Lao Tzu", themes: ["Wisdom", "Science & knowledge"], tone: "reflective", source: "Tao Te Ching" },
    { text: "A flower does not think of competing with the flower next to it. It just blooms.", author: "Zen proverb", themes: ["Nature", "Wisdom", "Life"], tone: "tender" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius", themes: ["Failure & resilience", "Work & ambition"], tone: "inspiring" },
    { text: "Real knowledge is to know the extent of one's ignorance.", author: "Confucius", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "Choose a job you love, and you will never have to work a day in your life.", author: "Confucius", themes: ["Work & ambition", "Life"], tone: "inspiring" },
    { text: "Our greatest glory is not in never falling, but in rising every time we fall.", author: "Confucius", themes: ["Failure & resilience", "Courage"], tone: "inspiring" },
    { text: "When it is obvious that the goals cannot be reached, don't adjust the goals, adjust the action steps.", author: "Confucius", themes: ["Work & ambition", "Wisdom"], tone: "inspiring" },
    { text: "Life is really simple, but we insist on making it complicated.", author: "Confucius", themes: ["Life", "Wisdom"], tone: "wry" },
    { text: "They must often change who would be constant in happiness or wisdom.", author: "Confucius", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "To be, or not to be, that is the question.", author: "William Shakespeare", themes: ["Life"], tone: "reflective", source: "Hamlet" },
    { text: "We know what we are, but know not what we may be.", author: "William Shakespeare", themes: ["Life", "Wisdom"], tone: "reflective", source: "Hamlet" },
    { text: "This above all: to thine own self be true.", author: "William Shakespeare", themes: ["Wisdom", "Life"], tone: "inspiring", source: "Hamlet" },
    { text: "The course of true love never did run smooth.", author: "William Shakespeare", themes: ["Love"], tone: "wry", source: "A Midsummer Night's Dream" },
    { text: "All the world's a stage, and all the men and women merely players.", author: "William Shakespeare", themes: ["Life"], tone: "reflective", source: "As You Like It" },
    { text: "Love all, trust a few, do wrong to none.", author: "William Shakespeare", themes: ["Love", "Wisdom"], tone: "tender", source: "All's Well That Ends Well" },
    { text: "Better three hours too soon than a minute too late.", author: "William Shakespeare", themes: ["Time"], tone: "wry", source: "The Merry Wives of Windsor" },
    { text: "Our doubts are traitors, and make us lose the good we oft might win, by fearing to attempt.", author: "William Shakespeare", themes: ["Courage", "Failure & resilience"], tone: "defiant", source: "Measure for Measure" },
    { text: "How far that little candle throws his beams! So shines a good deed in a weary world.", author: "William Shakespeare", themes: ["Wisdom", "Life"], tone: "tender", source: "The Merchant of Venice" },
    { text: "The fault, dear Brutus, is not in our stars, but in ourselves.", author: "William Shakespeare", themes: ["Life", "Wisdom"], tone: "defiant", source: "Julius Caesar" },
    { text: "Whatever you can do, or dream you can, begin it. Boldness has genius, power and magic in it.", author: "Johann Wolfgang von Goethe", themes: ["Courage", "Work & ambition"], tone: "inspiring" },
    { text: "Knowing is not enough; we must apply. Willing is not enough; we must do.", author: "Johann Wolfgang von Goethe", themes: ["Work & ambition", "Wisdom"], tone: "inspiring" },
    { text: "He who moves not forward, goes backward.", author: "Johann Wolfgang von Goethe", themes: ["Work & ambition", "Time"], tone: "defiant" },
    { text: "A man sees in the world what he carries in his heart.", author: "Johann Wolfgang von Goethe", themes: ["Life", "Wisdom"], tone: "reflective", source: "Faust" },
    { text: "That which does not kill us makes us stronger.", author: "Friedrich Nietzsche", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "He who has a why to live can bear almost any how.", author: "Friedrich Nietzsche", themes: ["Life", "Failure & resilience"], tone: "defiant" },
    { text: "And those who were seen dancing were thought to be insane by those who could not hear the music.", author: "Friedrich Nietzsche", themes: ["Creativity & art", "Wisdom"], tone: "defiant" },
    { text: "You must have chaos within you to give birth to a dancing star.", author: "Friedrich Nietzsche", themes: ["Creativity & art"], tone: "defiant", source: "Thus Spoke Zarathustra" },
    { text: "There is always some madness in love. But there is also always some reason in madness.", author: "Friedrich Nietzsche", themes: ["Love", "Wisdom"], tone: "wry" },
    { text: "Without music, life would be a mistake.", author: "Friedrich Nietzsche", themes: ["Creativity & art", "Life"], tone: "wry" },
    { text: "Imagination is more important than knowledge.", author: "Albert Einstein", themes: ["Creativity & art", "Science & knowledge"], tone: "inspiring" },
    { text: "Try not to become a man of success, but rather try to become a man of value.", author: "Albert Einstein", themes: ["Work & ambition", "Wisdom"], tone: "reflective" },
    { text: "A person who never made a mistake never tried anything new.", author: "Albert Einstein", themes: ["Failure & resilience", "Creativity & art"], tone: "inspiring" },
    { text: "Life is like riding a bicycle. To keep your balance, you must keep moving.", author: "Albert Einstein", themes: ["Life", "Wisdom"], tone: "wry" },
    { text: "The important thing is not to stop questioning. Curiosity has its own reason for existing.", author: "Albert Einstein", themes: ["Science & knowledge", "Wisdom"], tone: "inspiring" },
    { text: "Logic will get you from A to B. Imagination will take you everywhere.", author: "Albert Einstein", themes: ["Creativity & art", "Science & knowledge"], tone: "inspiring" },
    { text: "We cannot solve our problems with the same thinking we used when we created them.", author: "Albert Einstein", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "The whole of science is nothing more than a refinement of everyday thinking.", author: "Albert Einstein", themes: ["Science & knowledge"], tone: "reflective" },
    { text: "Nothing in life is to be feared, it is only to be understood. Now is the time to understand more, so that we may fear less.", author: "Marie Curie", themes: ["Science & knowledge", "Courage"], tone: "inspiring" },
    { text: "Be less curious about people and more curious about ideas.", author: "Marie Curie", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "One never notices what has been done; one can only see what remains to be done.", author: "Marie Curie", themes: ["Work & ambition", "Failure & resilience"], tone: "reflective" },
    { text: "I have not failed. I've just found ten thousand ways that won't work.", author: "Thomas Edison", themes: ["Failure & resilience", "Science & knowledge"], tone: "defiant" },
    { text: "Genius is one percent inspiration and ninety-nine percent perspiration.", author: "Thomas Edison", themes: ["Work & ambition", "Creativity & art"], tone: "wry" },
    { text: "Our greatest weakness lies in giving up. The most certain way to succeed is always to try just one more time.", author: "Thomas Edison", themes: ["Failure & resilience", "Work & ambition"], tone: "inspiring" },
    { text: "If we did all the things we are capable of, we would literally astound ourselves.", author: "Thomas Edison", themes: ["Work & ambition", "Courage"], tone: "inspiring" },
    { text: "There's a way to do it better \u2014 find it.", author: "Thomas Edison", themes: ["Work & ambition", "Creativity & art"], tone: "defiant" },
    { text: "Whatever the mind of man can conceive and believe, it can achieve.", author: "Napoleon Hill", themes: ["Work & ambition", "Courage"], tone: "inspiring" },
    { text: "It always seems impossible until it's done.", author: "Nelson Mandela", themes: ["Failure & resilience", "Courage"], tone: "inspiring" },
    { text: "Do not judge me by my successes, judge me by how many times I fell down and got back up again.", author: "Nelson Mandela", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela", themes: ["Science & knowledge", "Freedom"], tone: "inspiring" },
    { text: "May your choices reflect your hopes, not your fears.", author: "Nelson Mandela", themes: ["Courage", "Life"], tone: "inspiring" },
    { text: "Be the change that you wish to see in the world.", author: "Mahatma Gandhi", themes: ["Life", "Wisdom"], tone: "inspiring" },
    { text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "Mahatma Gandhi", themes: ["Life", "Science & knowledge", "Time"], tone: "inspiring" },
    { text: "The future depends on what you do today.", author: "Mahatma Gandhi", themes: ["Time", "Work & ambition"], tone: "inspiring" },
    { text: "Strength does not come from physical capacity. It comes from an indomitable will.", author: "Mahatma Gandhi", themes: ["Failure & resilience", "Courage"], tone: "defiant" },
    { text: "In a gentle way, you can shake the world.", author: "Mahatma Gandhi", themes: ["Courage", "Freedom"], tone: "inspiring" },
    { text: "Darkness cannot drive out darkness; only light can do that.", author: "Martin Luther King Jr.", themes: ["Wisdom", "Freedom"], tone: "inspiring" },
    { text: "The time is always right to do what is right.", author: "Martin Luther King Jr.", themes: ["Courage", "Wisdom"], tone: "defiant" },
    { text: "Faith is taking the first step even when you don't see the whole staircase.", author: "Martin Luther King Jr.", themes: ["Courage", "Failure & resilience"], tone: "inspiring" },
    { text: "Injustice anywhere is a threat to justice everywhere.", author: "Martin Luther King Jr.", themes: ["Freedom", "Wisdom"], tone: "defiant" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill", themes: ["Failure & resilience", "Courage"], tone: "defiant" },
    { text: "If you're going through hell, keep going.", author: "Winston Churchill", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "A pessimist sees the difficulty in every opportunity; an optimist sees the opportunity in every difficulty.", author: "Winston Churchill", themes: ["Wisdom", "Failure & resilience"], tone: "wry" },
    { text: "We make a living by what we get, but we make a life by what we give.", author: "Winston Churchill", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "Courage is what it takes to stand up and speak; courage is also what it takes to sit down and listen.", author: "Winston Churchill", themes: ["Courage", "Wisdom"], tone: "wry" },
    { text: "Now this is not the end. It is not even the beginning of the end. But it is, perhaps, the end of the beginning.", author: "Winston Churchill", themes: ["Time", "Failure & resilience"], tone: "defiant" },
    { text: "Nearly all men can stand adversity, but if you want to test a man's character, give him power.", author: "Abraham Lincoln", themes: ["Wisdom", "Courage"], tone: "reflective" },
    { text: "Whatever you are, be a good one.", author: "Abraham Lincoln", themes: ["Work & ambition", "Wisdom"], tone: "inspiring" },
    { text: "The best way to predict your future is to create it.", author: "Abraham Lincoln", themes: ["Time", "Work & ambition"], tone: "inspiring" },
    { text: "In the end, it's not the years in your life that count. It's the life in your years.", author: "Abraham Lincoln", themes: ["Life", "Time"], tone: "reflective" },
    { text: "Give me six hours to chop down a tree and I will spend the first four sharpening the axe.", author: "Abraham Lincoln", themes: ["Work & ambition", "Wisdom"], tone: "wry" },
    { text: "Most folks are about as happy as they make up their minds to be.", author: "Abraham Lincoln", themes: ["Life", "Wisdom"], tone: "wry" },
    { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt", themes: ["Work & ambition", "Failure & resilience"], tone: "inspiring" },
    { text: "Nothing in the world is worth having or worth doing unless it means effort, pain, difficulty.", author: "Theodore Roosevelt", themes: ["Work & ambition", "Failure & resilience"], tone: "defiant" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt", themes: ["Courage", "Work & ambition"], tone: "inspiring" },
    { text: "Comparison is the thief of joy.", author: "Theodore Roosevelt", themes: ["Life", "Wisdom"], tone: "wry" },
    { text: "The only thing we have to fear is fear itself.", author: "Franklin D. Roosevelt", themes: ["Courage", "Failure & resilience"], tone: "defiant" },
    { text: "When you reach the end of your rope, tie a knot in it and hang on.", author: "Franklin D. Roosevelt", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "It is not the critic who counts; the credit belongs to the man who is actually in the arena.", author: "Theodore Roosevelt", themes: ["Courage", "Failure & resilience"], tone: "defiant" },
    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt", themes: ["Work & ambition", "Courage"], tone: "inspiring" },
    { text: "No one can make you feel inferior without your consent.", author: "Eleanor Roosevelt", themes: ["Courage", "Wisdom"], tone: "defiant" },
    { text: "Do one thing every day that scares you.", author: "Eleanor Roosevelt", themes: ["Courage"], tone: "defiant" },
    { text: "Great minds discuss ideas; average minds discuss events; small minds discuss people.", author: "Eleanor Roosevelt", themes: ["Wisdom", "Science & knowledge"], tone: "wry" },
    { text: "Tell me and I forget. Teach me and I remember. Involve me and I learn.", author: "Benjamin Franklin", themes: ["Science & knowledge"], tone: "reflective" },
    { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin", themes: ["Science & knowledge", "Work & ambition"], tone: "wry" },
    { text: "Lost time is never found again.", author: "Benjamin Franklin", themes: ["Time"], tone: "reflective" },
    { text: "Either write something worth reading or do something worth writing.", author: "Benjamin Franklin", themes: ["Creativity & art", "Work & ambition"], tone: "defiant" },
    { text: "Well done is better than well said.", author: "Benjamin Franklin", themes: ["Work & ambition", "Wisdom"], tone: "wry" },
    { text: "By failing to prepare, you are preparing to fail.", author: "Benjamin Franklin", themes: ["Failure & resilience", "Work & ambition"], tone: "wry" },
    { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin", themes: ["Work & ambition", "Failure & resilience"], tone: "inspiring" },
    { text: "Twenty years from now you will be more disappointed by the things that you didn't do than by the ones you did do.", author: "Mark Twain", themes: ["Life", "Courage", "Time"], tone: "reflective" },
    { text: "The two most important days in your life are the day you are born and the day you find out why.", author: "Mark Twain", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "Whenever you find yourself on the side of the majority, it is time to pause and reflect.", author: "Mark Twain", themes: ["Wisdom", "Courage"], tone: "wry" },
    { text: "Kindness is the language which the deaf can hear and the blind can see.", author: "Mark Twain", themes: ["Love", "Wisdom"], tone: "tender" },
    { text: "Courage is resistance to fear, mastery of fear \u2014 not absence of fear.", author: "Mark Twain", themes: ["Courage"], tone: "defiant" },
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain", themes: ["Work & ambition"], tone: "wry" },
    { text: "Get your facts first, then you can distort them as you please.", author: "Mark Twain", themes: ["Humour", "Wisdom"], tone: "wry" },
    { text: "I have never let my schooling interfere with my education.", author: "Mark Twain", themes: ["Humour", "Science & knowledge"], tone: "wry" },
    { text: "A lie can travel halfway around the world while the truth is still putting on its shoes.", author: "Mark Twain", themes: ["Humour", "Wisdom"], tone: "wry" },
    { text: "Be yourself; everyone else is already taken.", author: "Oscar Wilde", themes: ["Life", "Humour"], tone: "wry" },
    { text: "We are all in the gutter, but some of us are looking at the stars.", author: "Oscar Wilde", themes: ["Life", "Courage"], tone: "wry", source: "Lady Windermere's Fan" },
    { text: "I can resist everything except temptation.", author: "Oscar Wilde", themes: ["Humour"], tone: "wry", source: "Lady Windermere's Fan" },
    { text: "Experience is simply the name we give our mistakes.", author: "Oscar Wilde", themes: ["Failure & resilience", "Humour"], tone: "wry", source: "Lady Windermere's Fan" },
    { text: "To live is the rarest thing in the world. Most people exist, that is all.", author: "Oscar Wilde", themes: ["Life"], tone: "reflective" },
    { text: "The truth is rarely pure and never simple.", author: "Oscar Wilde", themes: ["Wisdom", "Humour"], tone: "wry", source: "The Importance of Being Earnest" },
    { text: "Anyone who has never made a mistake has never tried anything new.", author: "Oscar Wilde", themes: ["Failure & resilience", "Creativity & art"], tone: "wry" },
    { text: "Always forgive your enemies; nothing annoys them so much.", author: "Oscar Wilde", themes: ["Humour", "Wisdom"], tone: "wry" },
    { text: "A cynic is a man who knows the price of everything and the value of nothing.", author: "Oscar Wilde", themes: ["Wisdom", "Humour"], tone: "wry", source: "Lady Windermere's Fan" },
    { text: "The man who does not read good books has no advantage over the man who cannot read them.", author: "Mark Twain", themes: ["Science & knowledge", "Creativity & art"], tone: "wry" },
    { text: "There is no greater agony than bearing an untold story inside you.", author: "Maya Angelou", themes: ["Creativity & art", "Life"], tone: "tender" },
    { text: "You may not control all the events that happen to you, but you can decide not to be reduced by them.", author: "Maya Angelou", themes: ["Failure & resilience", "Courage"], tone: "defiant" },
    { text: "I've learned that people will forget what you said, but people will never forget how you made them feel.", author: "Maya Angelou", themes: ["Love", "Wisdom"], tone: "tender" },
    { text: "Try to be a rainbow in someone's cloud.", author: "Maya Angelou", themes: ["Love", "Life"], tone: "tender" },
    { text: "We may encounter many defeats but we must not be defeated.", author: "Maya Angelou", themes: ["Failure & resilience", "Courage"], tone: "defiant" },
    { text: "Two roads diverged in a wood, and I \u2014 I took the one less traveled by, and that has made all the difference.", author: "Robert Frost", themes: ["Life", "Courage"], tone: "reflective", source: "The Road Not Taken" },
    { text: "In three words I can sum up everything I've learned about life: it goes on.", author: "Robert Frost", themes: ["Life", "Time"], tone: "wry" },
    { text: "The best way out is always through.", author: "Robert Frost", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "Hope is the thing with feathers that perches in the soul.", author: "Emily Dickinson", themes: ["Failure & resilience", "Creativity & art"], tone: "tender" },
    { text: "Dwell in possibility.", author: "Emily Dickinson", themes: ["Creativity & art", "Life"], tone: "inspiring" },
    { text: "Forever is composed of nows.", author: "Emily Dickinson", themes: ["Time", "Life"], tone: "reflective" },
    { text: "I dwell in possibility \u2014 a fairer house than prose.", author: "Emily Dickinson", themes: ["Creativity & art"], tone: "reflective" },
    { text: "And now here is my secret, a very simple secret: it is only with the heart that one can see rightly; what is essential is invisible to the eye.", author: "Antoine de Saint-Exup\xE9ry", themes: ["Love", "Wisdom"], tone: "tender", source: "The Little Prince" },
    { text: "A goal without a plan is just a wish.", author: "Antoine de Saint-Exup\xE9ry", themes: ["Work & ambition"], tone: "wry" },
    { text: "If you want to build a ship, don't drum up people to gather wood \u2014 teach them to long for the endless immensity of the sea.", author: "Antoine de Saint-Exup\xE9ry", themes: ["Work & ambition", "Creativity & art"], tone: "inspiring" },
    { text: "Love does not consist of gazing at each other, but in looking outward together in the same direction.", author: "Antoine de Saint-Exup\xE9ry", themes: ["Love"], tone: "tender" },
    { text: "What is essential is invisible to the eye.", author: "Antoine de Saint-Exup\xE9ry", themes: ["Love", "Wisdom"], tone: "tender", source: "The Little Prince" },
    { text: "All grown-ups were once children, although few of them remember it.", author: "Antoine de Saint-Exup\xE9ry", themes: ["Life", "Time"], tone: "tender", source: "The Little Prince" },
    { text: "The cure for boredom is curiosity. There is no cure for curiosity.", author: "Dorothy Parker", themes: ["Science & knowledge", "Humour"], tone: "wry" },
    { text: "Writing is not necessarily something to be ashamed of, but do it in private and wash your hands afterwards.", author: "Robert A. Heinlein", themes: ["Creativity & art", "Humour"], tone: "wry" },
    { text: "The more I read, the more I acquire, the more certain I am that I know nothing.", author: "Voltaire", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "Judge a man by his questions rather than by his answers.", author: "Voltaire", themes: ["Wisdom", "Science & knowledge"], tone: "reflective" },
    { text: "Common sense is not so common.", author: "Voltaire", themes: ["Wisdom", "Humour"], tone: "wry" },
    { text: "Perfect is the enemy of good.", author: "Voltaire", themes: ["Work & ambition", "Wisdom"], tone: "wry" },
    { text: "Let us cultivate our garden.", author: "Voltaire", themes: ["Nature", "Work & ambition"], tone: "reflective", source: "Candide" },
    { text: "Cherish those who seek the truth but beware of those who find it.", author: "Voltaire", themes: ["Wisdom", "Science & knowledge"], tone: "wry" },
    { text: "Man is born free, and everywhere he is in chains.", author: "Jean-Jacques Rousseau", themes: ["Freedom"], tone: "defiant", source: "The Social Contract" },
    { text: "Patience is bitter, but its fruit is sweet.", author: "Jean-Jacques Rousseau", themes: ["Time", "Wisdom"], tone: "reflective" },
    { text: "I cannot live without books.", author: "Thomas Jefferson", themes: ["Science & knowledge", "Creativity & art"], tone: "tender" },
    { text: "Do you want to know who you are? Don't ask. Act. Action will delineate and define you.", author: "Thomas Jefferson", themes: ["Life", "Work & ambition"], tone: "defiant" },
    { text: "Honesty is the first chapter in the book of wisdom.", author: "Thomas Jefferson", themes: ["Wisdom"], tone: "reflective" },
    { text: "I'm a great believer in luck, and I find the harder I work the more I have of it.", author: "Thomas Jefferson", themes: ["Work & ambition", "Humour"], tone: "wry" },
    { text: "He who knows best knows how little he knows.", author: "Thomas Jefferson", themes: ["Wisdom", "Science & knowledge"], tone: "reflective" },
    { text: "The greatest glory in living lies not in never falling, but in rising every time we fall.", author: "Ralph Waldo Emerson", themes: ["Failure & resilience", "Courage"], tone: "inspiring" },
    { text: "What lies behind us and what lies before us are tiny matters compared to what lies within us.", author: "Ralph Waldo Emerson", themes: ["Courage", "Wisdom"], tone: "inspiring" },
    { text: "To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment.", author: "Ralph Waldo Emerson", themes: ["Courage", "Life"], tone: "defiant" },
    { text: "Do not go where the path may lead, go instead where there is no path and leave a trail.", author: "Ralph Waldo Emerson", themes: ["Courage", "Creativity & art"], tone: "defiant" },
    { text: "Write it on your heart that every day is the best day in the year.", author: "Ralph Waldo Emerson", themes: ["Life", "Time"], tone: "tender" },
    { text: "The earth laughs in flowers.", author: "Ralph Waldo Emerson", themes: ["Nature", "Creativity & art"], tone: "tender" },
    { text: "Adopt the pace of nature: her secret is patience.", author: "Ralph Waldo Emerson", themes: ["Nature", "Time", "Wisdom"], tone: "reflective" },
    { text: "Nothing great was ever achieved without enthusiasm.", author: "Ralph Waldo Emerson", themes: ["Work & ambition", "Courage"], tone: "inspiring" },
    { text: "Go confidently in the direction of your dreams. Live the life you have imagined.", author: "Henry David Thoreau", themes: ["Life", "Courage"], tone: "inspiring" },
    { text: "I went to the woods because I wished to live deliberately.", author: "Henry David Thoreau", themes: ["Nature", "Life"], tone: "reflective", source: "Walden" },
    { text: "Not until we are lost do we begin to understand ourselves.", author: "Henry David Thoreau", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "It's not what you look at that matters, it's what you see.", author: "Henry David Thoreau", themes: ["Wisdom", "Creativity & art"], tone: "reflective" },
    { text: "Live in each season as it passes; breathe the air, drink the drink, taste the fruit.", author: "Henry David Thoreau", themes: ["Nature", "Life", "Time"], tone: "tender" },
    { text: "Heaven is under our feet as well as over our heads.", author: "Henry David Thoreau", themes: ["Nature", "Wisdom"], tone: "reflective", source: "Walden" },
    { text: "Beware of all enterprises that require new clothes.", author: "Henry David Thoreau", themes: ["Wisdom", "Humour"], tone: "wry", source: "Walden" },
    { text: "The mass of men lead lives of quiet desperation.", author: "Henry David Thoreau", themes: ["Life"], tone: "reflective", source: "Walden" },
    { text: "What you get by achieving your goals is not as important as what you become by achieving your goals.", author: "Henry David Thoreau", themes: ["Work & ambition", "Life"], tone: "reflective" },
    { text: "Keep your face always toward the sunshine \u2014 and shadows will fall behind you.", author: "Walt Whitman", themes: ["Life", "Courage"], tone: "tender" },
    { text: "I exist as I am, that is enough.", author: "Walt Whitman", themes: ["Life", "Courage"], tone: "defiant", source: "Leaves of Grass" },
    { text: "Do I contradict myself? Very well then I contradict myself, I am large, I contain multitudes.", author: "Walt Whitman", themes: ["Life", "Creativity & art"], tone: "defiant", source: "Leaves of Grass" },
    { text: "Resist much, obey little.", author: "Walt Whitman", themes: ["Freedom", "Courage"], tone: "defiant", source: "Leaves of Grass" },
    { text: "Keep your eyes on the stars, and your feet on the ground.", author: "Theodore Roosevelt", themes: ["Courage", "Wisdom"], tone: "inspiring" },
    { text: "Look deep into nature, and then you will understand everything better.", author: "Albert Einstein", themes: ["Nature", "Science & knowledge"], tone: "reflective" },
    { text: "Adopt the pace of the seasons; nature never rushes, yet all is done.", author: "Lao Tzu", themes: ["Nature", "Time"], tone: "reflective" },
    { text: "To plant a garden is to believe in tomorrow.", author: "Audrey Hepburn", themes: ["Nature", "Time"], tone: "tender" },
    { text: "Happiness is not something ready-made. It comes from your own actions.", author: "Dalai Lama XIV", themes: ["Life", "Wisdom"], tone: "inspiring" },
    { text: "Give the ones you love wings to fly, roots to come back, and reasons to stay.", author: "Dalai Lama XIV", themes: ["Love", "Wisdom"], tone: "tender" },
    { text: "Love is composed of a single soul inhabiting two bodies.", author: "Aristotle", themes: ["Love"], tone: "tender" },
    { text: "Where there is love there is life.", author: "Mahatma Gandhi", themes: ["Love", "Life"], tone: "tender" },
    { text: "The best thing to hold onto in life is each other.", author: "Audrey Hepburn", themes: ["Love", "Life"], tone: "tender" },
    { text: "We are most alive when we're in love.", author: "John Updike", themes: ["Love", "Life"], tone: "tender" },
    { text: "Love is friendship that has caught fire.", author: "Ann Landers", themes: ["Love"], tone: "tender" },
    { text: "A friend is one who knows you and loves you just the same.", author: "Elbert Hubbard", themes: ["Love", "Life"], tone: "tender" },
    { text: "Friendship is the only cement that will ever hold the world together.", author: "Woodrow Wilson", themes: ["Love", "Wisdom"], tone: "tender" },
    { text: "There is only one happiness in this life, to love and be loved.", author: "George Sand", themes: ["Love", "Life"], tone: "tender" },
    { text: "Tis better to have loved and lost than never to have loved at all.", author: "Alfred, Lord Tennyson", themes: ["Love", "Failure & resilience"], tone: "tender", source: "In Memoriam A.H.H." },
    { text: "How do I love thee? Let me count the ways.", author: "Elizabeth Barrett Browning", themes: ["Love"], tone: "tender", source: "Sonnets from the Portuguese" },
    { text: "Whatever our souls are made of, his and mine are the same.", author: "Emily Bront\xEB", themes: ["Love"], tone: "tender", source: "Wuthering Heights" },
    { text: "You pierce my soul. I am half agony, half hope.", author: "Jane Austen", themes: ["Love"], tone: "tender", source: "Persuasion" },
    { text: "There is no charm equal to tenderness of heart.", author: "Jane Austen", themes: ["Love", "Wisdom"], tone: "tender", source: "Emma" },
    { text: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.", author: "Jane Austen", themes: ["Love", "Humour"], tone: "wry", source: "Pride and Prejudice" },
    { text: "The person, be it gentleman or lady, who has not pleasure in a good novel, must be intolerably stupid.", author: "Jane Austen", themes: ["Creativity & art", "Humour"], tone: "wry", source: "Northanger Abbey" },
    { text: "We accept the love we think we deserve.", author: "Plato", themes: ["Love", "Wisdom"], tone: "reflective" },
    { text: "At the touch of love everyone becomes a poet.", author: "Plato", themes: ["Love", "Creativity & art"], tone: "tender" },
    { text: "Wise men speak because they have something to say; fools because they have to say something.", author: "Plato", themes: ["Wisdom", "Humour"], tone: "wry" },
    { text: "The beginning is the most important part of the work.", author: "Plato", themes: ["Work & ambition", "Wisdom"], tone: "reflective", source: "The Republic" },
    { text: "Necessity is the mother of invention.", author: "Plato", themes: ["Creativity & art", "Science & knowledge"], tone: "wry" },
    { text: "Courage is knowing what not to fear.", author: "Plato", themes: ["Courage", "Wisdom"], tone: "reflective" },
    { text: "Every artist was first an amateur.", author: "Ralph Waldo Emerson", themes: ["Creativity & art", "Work & ambition"], tone: "inspiring" },
    { text: "Creativity takes courage.", author: "Henri Matisse", themes: ["Creativity & art", "Courage"], tone: "defiant" },
    { text: "Art washes away from the soul the dust of everyday life.", author: "Pablo Picasso", themes: ["Creativity & art", "Life"], tone: "tender" },
    { text: "Every child is an artist. The problem is how to remain an artist once we grow up.", author: "Pablo Picasso", themes: ["Creativity & art", "Life"], tone: "wry" },
    { text: "Action is the foundational key to all success.", author: "Pablo Picasso", themes: ["Work & ambition"], tone: "inspiring" },
    { text: "I am always doing that which I cannot do, in order that I may learn how to do it.", author: "Pablo Picasso", themes: ["Creativity & art", "Failure & resilience"], tone: "defiant" },
    { text: "Inspiration exists, but it has to find you working.", author: "Pablo Picasso", themes: ["Creativity & art", "Work & ambition"], tone: "wry" },
    { text: "A painter should begin every canvas with a wash of black, because all things in nature are dark except where exposed by the light.", author: "Leonardo da Vinci", themes: ["Creativity & art", "Nature"], tone: "reflective" },
    { text: "Learning never exhausts the mind.", author: "Leonardo da Vinci", themes: ["Science & knowledge"], tone: "inspiring" },
    { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci", themes: ["Creativity & art", "Wisdom"], tone: "reflective" },
    { text: "Art is never finished, only abandoned.", author: "Leonardo da Vinci", themes: ["Creativity & art"], tone: "wry" },
    { text: "Obstacles cannot crush me. Every obstacle yields to stern resolve.", author: "Leonardo da Vinci", themes: ["Failure & resilience", "Courage"], tone: "defiant" },
    { text: "The noblest pleasure is the joy of understanding.", author: "Leonardo da Vinci", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "I would rather die of passion than of boredom.", author: "Vincent van Gogh", themes: ["Life", "Creativity & art"], tone: "defiant" },
    { text: "Great things are done by a series of small things brought together.", author: "Vincent van Gogh", themes: ["Work & ambition", "Creativity & art"], tone: "inspiring" },
    { text: "I dream my painting and I paint my dream.", author: "Vincent van Gogh", themes: ["Creativity & art"], tone: "tender" },
    { text: "Normality is a paved road: it's comfortable to walk but no flowers grow on it.", author: "Vincent van Gogh", themes: ["Creativity & art", "Life"], tone: "defiant" },
    { text: "If you hear a voice within you say 'you cannot paint,' then by all means paint, and that voice will be silenced.", author: "Vincent van Gogh", themes: ["Creativity & art", "Courage"], tone: "defiant" },
    { text: "The aim of art is to represent not the outward appearance of things, but their inward significance.", author: "Aristotle", themes: ["Creativity & art"], tone: "reflective" },
    { text: "Music is the silence between the notes.", author: "Claude Debussy", themes: ["Creativity & art"], tone: "reflective" },
    { text: "Music is a higher revelation than all wisdom and philosophy.", author: "Ludwig van Beethoven", themes: ["Creativity & art", "Wisdom"], tone: "inspiring" },
    { text: "To play a wrong note is insignificant; to play without passion is inexcusable.", author: "Ludwig van Beethoven", themes: ["Creativity & art"], tone: "defiant" },
    { text: "Don't only practice your art, but force your way into its secrets.", author: "Ludwig van Beethoven", themes: ["Creativity & art", "Work & ambition"], tone: "defiant" },
    { text: "The poet is the priest of the invisible.", author: "Wallace Stevens", themes: ["Creativity & art"], tone: "reflective" },
    { text: "A word after a word after a word is power.", author: "Margaret Atwood", themes: ["Creativity & art"], tone: "defiant" },
    { text: "Fill your paper with the breathings of your heart.", author: "William Wordsworth", themes: ["Creativity & art"], tone: "tender" },
    { text: "Poetry is the spontaneous overflow of powerful feelings.", author: "William Wordsworth", themes: ["Creativity & art"], tone: "reflective", source: "Lyrical Ballads" },
    { text: "The world is too much with us; late and soon, getting and spending, we lay waste our powers.", author: "William Wordsworth", themes: ["Life", "Nature"], tone: "reflective" },
    { text: "Beauty is truth, truth beauty \u2014 that is all ye know on earth, and all ye need to know.", author: "John Keats", themes: ["Creativity & art", "Wisdom"], tone: "reflective", source: "Ode on a Grecian Urn" },
    { text: "A thing of beauty is a joy for ever.", author: "John Keats", themes: ["Creativity & art", "Nature"], tone: "tender", source: "Endymion" },
    { text: "Heard melodies are sweet, but those unheard are sweeter.", author: "John Keats", themes: ["Creativity & art"], tone: "reflective", source: "Ode on a Grecian Urn" },
    { text: "If I had more time, I would have written a shorter letter.", author: "Blaise Pascal", themes: ["Creativity & art", "Time", "Humour"], tone: "wry" },
    { text: "The heart has its reasons of which reason knows nothing.", author: "Blaise Pascal", themes: ["Love", "Wisdom"], tone: "reflective" },
    { text: "All of humanity's problems stem from man's inability to sit quietly in a room alone.", author: "Blaise Pascal", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "I think, therefore I am.", author: "Ren\xE9 Descartes", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "It is not enough to have a good mind; the main thing is to use it well.", author: "Ren\xE9 Descartes", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "If I have seen further it is by standing on the shoulders of giants.", author: "Isaac Newton", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "I do not know what I may appear to the world, but to myself I seem to have been only like a boy playing on the seashore.", author: "Isaac Newton", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "Eppur si muove \u2014 and yet it moves.", author: "Galileo Galilei", themes: ["Science & knowledge", "Courage"], tone: "defiant" },
    { text: "All truths are easy to understand once they are discovered; the point is to discover them.", author: "Galileo Galilei", themes: ["Science & knowledge"], tone: "reflective" },
    { text: "Measure what is measurable, and make measurable what is not so.", author: "Galileo Galilei", themes: ["Science & knowledge"], tone: "reflective" },
    { text: "Somewhere, something incredible is waiting to be known.", author: "Carl Sagan", themes: ["Science & knowledge"], tone: "inspiring" },
    { text: "We are made of star-stuff.", author: "Carl Sagan", themes: ["Science & knowledge", "Nature"], tone: "inspiring" },
    { text: "Extraordinary claims require extraordinary evidence.", author: "Carl Sagan", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "Science is a way of thinking much more than it is a body of knowledge.", author: "Carl Sagan", themes: ["Science & knowledge"], tone: "reflective" },
    { text: "The good thing about science is that it's true whether or not you believe in it.", author: "Neil deGrasse Tyson", themes: ["Science & knowledge"], tone: "wry" },
    { text: "Equipped with his five senses, man explores the universe around him and calls the adventure science.", author: "Edwin Hubble", themes: ["Science & knowledge"], tone: "inspiring" },
    { text: "Time is the wisest counsellor of all.", author: "Pericles", themes: ["Time", "Wisdom"], tone: "reflective" },
    { text: "Time you enjoy wasting is not wasted time.", author: "Marthe Troly-Curtin", themes: ["Time", "Life", "Humour"], tone: "wry" },
    { text: "Yesterday is history, tomorrow is a mystery, today is a gift.", author: "Alice Morse Earle", themes: ["Time", "Life"], tone: "tender" },
    { text: "Dost thou love life? Then do not squander time, for that is the stuff life is made of.", author: "Benjamin Franklin", themes: ["Time", "Life"], tone: "reflective" },
    { text: "The trouble is, you think you have time.", author: "Buddha", themes: ["Time", "Life"], tone: "reflective" },
    { text: "Better than a thousand hollow words, is one word that brings peace.", author: "Buddha", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "Three things cannot be long hidden: the sun, the moon, and the truth.", author: "Buddha", themes: ["Wisdom"], tone: "reflective" },
    { text: "What we think, we become.", author: "Buddha", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "Peace comes from within. Do not seek it without.", author: "Buddha", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "No one saves us but ourselves. We ourselves must walk the path.", author: "Buddha", themes: ["Wisdom", "Courage"], tone: "defiant" },
    { text: "Holding on to anger is like grasping a hot coal with the intent of throwing it at someone else; you are the one who gets burned.", author: "Buddha", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "However many holy words you read, however many you speak, what good will they do you if you do not act upon them?", author: "Buddha", themes: ["Wisdom", "Work & ambition"], tone: "defiant" },
    { text: "The mind is everything. What you think you become.", author: "Buddha", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "Fall seven times, stand up eight.", author: "Japanese proverb", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "The bamboo that bends is stronger than the oak that resists.", author: "Japanese proverb", themes: ["Failure & resilience", "Nature"], tone: "reflective" },
    { text: "A journey of healing begins by naming the wound.", author: "Proverb", themes: ["Failure & resilience", "Wisdom"], tone: "tender" },
    { text: "Smooth seas do not make skilful sailors.", author: "African proverb", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "If you want to go fast, go alone. If you want to go far, go together.", author: "African proverb", themes: ["Wisdom", "Work & ambition"], tone: "reflective" },
    { text: "However long the night, the dawn will break.", author: "African proverb", themes: ["Failure & resilience", "Time"], tone: "inspiring" },
    { text: "When the music changes, so does the dance.", author: "African proverb", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "A bird does not sing because it has an answer. It sings because it has a song.", author: "Chinese proverb", themes: ["Creativity & art", "Nature"], tone: "tender" },
    { text: "The best time to plant a tree was twenty years ago. The second best time is now.", author: "Chinese proverb", themes: ["Time", "Work & ambition", "Nature"], tone: "inspiring" },
    { text: "A gem cannot be polished without friction, nor a man perfected without trials.", author: "Chinese proverb", themes: ["Failure & resilience"], tone: "reflective" },
    { text: "Be not afraid of growing slowly, be afraid only of standing still.", author: "Chinese proverb", themes: ["Work & ambition", "Failure & resilience"], tone: "defiant" },
    { text: "Tension is who you think you should be. Relaxation is who you are.", author: "Chinese proverb", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "A book is a dream that you hold in your hand.", author: "Neil Gaiman", themes: ["Creativity & art"], tone: "tender" },
    { text: "We read to know we are not alone.", author: "C. S. Lewis", themes: ["Creativity & art", "Life"], tone: "tender" },
    { text: "You are never too old to set another goal or to dream a new dream.", author: "C. S. Lewis", themes: ["Work & ambition", "Life"], tone: "inspiring" },
    { text: "Hardships often prepare ordinary people for an extraordinary destiny.", author: "C. S. Lewis", themes: ["Failure & resilience", "Courage"], tone: "inspiring" },
    { text: "Integrity is doing the right thing, even when no one is watching.", author: "C. S. Lewis", themes: ["Wisdom", "Courage"], tone: "reflective" },
    { text: "There are far better things ahead than any we leave behind.", author: "C. S. Lewis", themes: ["Time", "Failure & resilience"], tone: "inspiring" },
    { text: "Not all those who wander are lost.", author: "J. R. R. Tolkien", themes: ["Life", "Courage"], tone: "reflective", source: "The Fellowship of the Ring" },
    { text: "Little by little, one travels far.", author: "J. R. R. Tolkien", themes: ["Work & ambition", "Time"], tone: "inspiring" },
    { text: "It's the job that's never started as takes longest to finish.", author: "J. R. R. Tolkien", themes: ["Work & ambition", "Humour"], tone: "wry" },
    { text: "Faithless is he that says farewell when the road darkens.", author: "J. R. R. Tolkien", themes: ["Courage", "Love"], tone: "defiant" },
    { text: "All we have to decide is what to do with the time that is given us.", author: "J. R. R. Tolkien", themes: ["Time", "Courage"], tone: "reflective", source: "The Fellowship of the Ring" },
    { text: "The world breaks everyone, and afterward, some are strong at the broken places.", author: "Ernest Hemingway", themes: ["Failure & resilience"], tone: "reflective", source: "A Farewell to Arms" },
    { text: "Courage is grace under pressure.", author: "Ernest Hemingway", themes: ["Courage"], tone: "reflective" },
    { text: "There is nothing to writing. All you do is sit down at a typewriter and bleed.", author: "Ernest Hemingway", themes: ["Creativity & art", "Work & ambition"], tone: "wry" },
    { text: "But man is not made for defeat. A man can be destroyed but not defeated.", author: "Ernest Hemingway", themes: ["Failure & resilience", "Courage"], tone: "defiant", source: "The Old Man and the Sea" },
    { text: "All you need is the plan, the road map, and the courage to press on to your destination.", author: "Earl Nightingale", themes: ["Work & ambition", "Courage"], tone: "inspiring" },
    { text: "Whether you think you can, or you think you can't \u2014 you're right.", author: "Henry Ford", themes: ["Work & ambition", "Courage"], tone: "defiant" },
    { text: "Failure is simply the opportunity to begin again, this time more intelligently.", author: "Henry Ford", themes: ["Failure & resilience", "Work & ambition"], tone: "inspiring" },
    { text: "Coming together is a beginning; keeping together is progress; working together is success.", author: "Henry Ford", themes: ["Work & ambition", "Wisdom"], tone: "inspiring" },
    { text: "Quality means doing it right when no one is looking.", author: "Henry Ford", themes: ["Work & ambition", "Wisdom"], tone: "reflective" },
    { text: "Obstacles are those frightful things you see when you take your eyes off your goal.", author: "Henry Ford", themes: ["Failure & resilience", "Work & ambition"], tone: "defiant" },
    { text: "I am not a product of my circumstances. I am a product of my decisions.", author: "Stephen Covey", themes: ["Life", "Courage"], tone: "defiant" },
    { text: "Sell your cleverness and buy bewilderment.", author: "Rumi", themes: ["Wisdom", "Creativity & art"], tone: "reflective" },
    { text: "The wound is the place where the light enters you.", author: "Rumi", themes: ["Failure & resilience", "Wisdom"], tone: "tender" },
    { text: "What you seek is seeking you.", author: "Rumi", themes: ["Love", "Life"], tone: "tender" },
    { text: "Raise your words, not your voice. It is rain that grows flowers, not thunder.", author: "Rumi", themes: ["Wisdom", "Nature"], tone: "tender" },
    { text: "Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself.", author: "Rumi", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "You were born with wings, why prefer to crawl through life?", author: "Rumi", themes: ["Courage", "Freedom"], tone: "defiant" },
    { text: "Let yourself be silently drawn by the strange pull of what you really love.", author: "Rumi", themes: ["Love", "Life"], tone: "tender" },
    { text: "Out beyond ideas of wrongdoing and rightdoing, there is a field. I'll meet you there.", author: "Rumi", themes: ["Wisdom", "Love"], tone: "tender" },
    { text: "When you do things from your soul, you feel a river moving in you, a joy.", author: "Rumi", themes: ["Creativity & art", "Life"], tone: "tender" },
    { text: "The quieter you become, the more you are able to hear.", author: "Rumi", themes: ["Wisdom"], tone: "reflective" },
    { text: "A room without books is like a body without a soul.", author: "Marcus Tullius Cicero", themes: ["Creativity & art", "Science & knowledge"], tone: "tender" },
    { text: "If you have a garden and a library, you have everything you need.", author: "Marcus Tullius Cicero", themes: ["Nature", "Science & knowledge"], tone: "tender" },
    { text: "The life of the dead is placed in the memory of the living.", author: "Marcus Tullius Cicero", themes: ["Time", "Life"], tone: "reflective" },
    { text: "Gratitude is not only the greatest of virtues, but the parent of all others.", author: "Marcus Tullius Cicero", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "While there's life, there's hope.", author: "Marcus Tullius Cicero", themes: ["Failure & resilience", "Life"], tone: "inspiring" },
    { text: "I came, I saw, I conquered.", author: "Julius Caesar", themes: ["Courage", "Work & ambition"], tone: "defiant" },
    { text: "It is better to die on your feet than to live on your knees.", author: "Emiliano Zapata", themes: ["Freedom", "Courage"], tone: "defiant" },
    { text: "Give me liberty, or give me death!", author: "Patrick Henry", themes: ["Freedom", "Courage"], tone: "defiant" },
    { text: "Those who deny freedom to others deserve it not for themselves.", author: "Abraham Lincoln", themes: ["Freedom", "Wisdom"], tone: "defiant" },
    { text: "Freedom is never voluntarily given by the oppressor; it must be demanded by the oppressed.", author: "Martin Luther King Jr.", themes: ["Freedom", "Courage"], tone: "defiant" },
    { text: "For to be free is not merely to cast off one's chains, but to live in a way that respects and enhances the freedom of others.", author: "Nelson Mandela", themes: ["Freedom", "Wisdom"], tone: "reflective" },
    { text: "Better to light a candle than to curse the darkness.", author: "Chinese proverb", themes: ["Wisdom", "Courage"], tone: "inspiring" },
    { text: "The unexamined life may not be worth living, but the unlived life is not worth examining.", author: "Proverb", themes: ["Life", "Wisdom"], tone: "wry" },
    { text: "Life is what happens to us while we are making other plans.", author: "Allen Saunders", themes: ["Life", "Time"], tone: "wry" },
    { text: "Everything you can imagine is real.", author: "Pablo Picasso", themes: ["Creativity & art", "Life"], tone: "inspiring" },
    { text: "I would rather walk with a friend in the dark, than alone in the light.", author: "Helen Keller", themes: ["Love", "Life"], tone: "tender" },
    { text: "Although the world is full of suffering, it is also full of the overcoming of it.", author: "Helen Keller", themes: ["Failure & resilience", "Life"], tone: "inspiring" },
    { text: "Life is either a daring adventure or nothing at all.", author: "Helen Keller", themes: ["Life", "Courage"], tone: "defiant" },
    { text: "The best and most beautiful things in the world cannot be seen or even touched \u2014 they must be felt with the heart.", author: "Helen Keller", themes: ["Love", "Wisdom"], tone: "tender" },
    { text: "Alone we can do so little; together we can do so much.", author: "Helen Keller", themes: ["Work & ambition", "Love"], tone: "inspiring" },
    { text: "Keep your face to the sunshine and you cannot see a shadow.", author: "Helen Keller", themes: ["Life", "Courage"], tone: "inspiring" },
    { text: "When one door of happiness closes, another opens; but often we look so long at the closed door that we do not see the one which has been opened for us.", author: "Helen Keller", themes: ["Failure & resilience", "Life"], tone: "reflective" },
    { text: "Reading is to the mind what exercise is to the body.", author: "Joseph Addison", themes: ["Science & knowledge", "Creativity & art"], tone: "reflective" },
    { text: "He who opens a school door, closes a prison.", author: "Victor Hugo", themes: ["Science & knowledge", "Freedom"], tone: "inspiring" },
    { text: "Even the darkest night will end and the sun will rise.", author: "Victor Hugo", themes: ["Failure & resilience", "Time"], tone: "inspiring", source: "Les Mis\xE9rables" },
    { text: "To love another person is to see the face of God.", author: "Victor Hugo", themes: ["Love"], tone: "tender", source: "Les Mis\xE9rables" },
    { text: "Music expresses that which cannot be said and on which it is impossible to be silent.", author: "Victor Hugo", themes: ["Creativity & art"], tone: "reflective" },
    { text: "Laughter is the sun that drives winter from the human face.", author: "Victor Hugo", themes: ["Humour", "Life"], tone: "tender" },
    { text: "A day without laughter is a day wasted.", author: "Charlie Chaplin", themes: ["Humour", "Life"], tone: "wry" },
    { text: "Life is a tragedy when seen in close-up, but a comedy in long-shot.", author: "Charlie Chaplin", themes: ["Humour", "Life"], tone: "wry" },
    { text: "You'll never find a rainbow if you're looking down.", author: "Charlie Chaplin", themes: ["Life", "Courage"], tone: "inspiring" },
    { text: "The reports of my death are greatly exaggerated.", author: "Mark Twain", themes: ["Humour"], tone: "wry" },
    { text: "I am so clever that sometimes I don't understand a single word of what I am saying.", author: "Oscar Wilde", themes: ["Humour"], tone: "wry" },
    { text: "Some cause happiness wherever they go; others whenever they go.", author: "Oscar Wilde", themes: ["Humour", "Life"], tone: "wry" },
    { text: "I am not young enough to know everything.", author: "Oscar Wilde", themes: ["Humour", "Wisdom"], tone: "wry" },
    { text: "Procrastination is the thief of time.", author: "Edward Young", themes: ["Time", "Work & ambition"], tone: "wry" },
    { text: "Do not wait to strike till the iron is hot; but make it hot by striking.", author: "William Butler Yeats", themes: ["Work & ambition", "Courage"], tone: "defiant" },
    { text: "Education is not the filling of a pail, but the lighting of a fire.", author: "William Butler Yeats", themes: ["Science & knowledge"], tone: "inspiring" },
    { text: "There are no strangers here; only friends you haven't yet met.", author: "William Butler Yeats", themes: ["Love", "Life"], tone: "tender" },
    { text: "Tread softly because you tread on my dreams.", author: "William Butler Yeats", themes: ["Love", "Creativity & art"], tone: "tender" },
    { text: "Happiness is when what you think, what you say, and what you do are in harmony.", author: "Mahatma Gandhi", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "First they ignore you, then they laugh at you, then they fight you, then you win.", author: "Mahatma Gandhi", themes: ["Courage", "Failure & resilience"], tone: "defiant" },
    { text: "An eye for an eye only ends up making the whole world blind.", author: "Mahatma Gandhi", themes: ["Wisdom", "Freedom"], tone: "reflective" },
    { text: "The weak can never forgive. Forgiveness is the attribute of the strong.", author: "Mahatma Gandhi", themes: ["Wisdom", "Courage"], tone: "reflective" },
    { text: "Earth provides enough to satisfy every man's needs, but not every man's greed.", author: "Mahatma Gandhi", themes: ["Nature", "Wisdom"], tone: "reflective" },
    { text: "I have learned over the years that when one's mind is made up, this diminishes fear.", author: "Rosa Parks", themes: ["Courage", "Freedom"], tone: "defiant" },
    { text: "You must never be fearful about what you are doing when it is right.", author: "Rosa Parks", themes: ["Courage"], tone: "defiant" },
    { text: "I would have girls regard themselves not as adjectives but as nouns.", author: "Elizabeth Cady Stanton", themes: ["Freedom", "Courage"], tone: "defiant" },
    { text: "The most common way people give up their power is by thinking they don't have any.", author: "Alice Walker", themes: ["Courage", "Freedom"], tone: "defiant" },
    { text: "In the depth of winter, I finally learned that within me there lay an invincible summer.", author: "Albert Camus", themes: ["Failure & resilience", "Nature"], tone: "defiant" },
    { text: "Real generosity toward the future lies in giving all to the present.", author: "Albert Camus", themes: ["Time", "Life"], tone: "reflective" },
    { text: "You will never be happy if you continue to search for what happiness consists of.", author: "Albert Camus", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "Don't walk behind me; I may not lead. Don't walk in front of me; I may not follow. Just walk beside me and be my friend.", author: "Albert Camus", themes: ["Love", "Life"], tone: "tender" },
    { text: "Should I kill myself, or have a cup of coffee?", author: "Albert Camus", themes: ["Life", "Humour"], tone: "wry" },
    { text: "He who has never failed somewhere, that man cannot be great.", author: "Herman Melville", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "It is better to fail in originality than to succeed in imitation.", author: "Herman Melville", themes: ["Creativity & art", "Failure & resilience"], tone: "defiant" },
    { text: "Whenever I feel like criticizing anyone, just remember that all the people in this world haven't had the advantages that you've had.", author: "F. Scott Fitzgerald", themes: ["Wisdom", "Life"], tone: "reflective", source: "The Great Gatsby" },
    { text: "That is part of the beauty of all literature. You discover that your longings are universal longings.", author: "F. Scott Fitzgerald", themes: ["Creativity & art", "Life"], tone: "tender" },
    { text: "Vitality shows in not only the ability to persist but the ability to start over.", author: "F. Scott Fitzgerald", themes: ["Failure & resilience", "Work & ambition"], tone: "inspiring" },
    { text: "The most wasted of all days is one without laughter.", author: "E. E. Cummings", themes: ["Humour", "Life"], tone: "wry" },
    { text: "It takes courage to grow up and become who you really are.", author: "E. E. Cummings", themes: ["Courage", "Life"], tone: "defiant" },
    { text: "Once we accept our limits, we go beyond them.", author: "Albert Einstein", themes: ["Failure & resilience", "Courage"], tone: "defiant" },
    { text: "Wherever you go, go with all your heart.", author: "Confucius", themes: ["Life", "Work & ambition"], tone: "inspiring" },
    { text: "To know what you know and what you do not know, that is true knowledge.", author: "Confucius", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "When anger rises, think of the consequences.", author: "Confucius", themes: ["Wisdom"], tone: "reflective" },
    { text: "The superior man is modest in his speech, but exceeds in his actions.", author: "Confucius", themes: ["Work & ambition", "Wisdom"], tone: "reflective" },
    { text: "Everything has beauty, but not everyone sees it.", author: "Confucius", themes: ["Creativity & art", "Wisdom"], tone: "reflective" }
  ]
};

// studio-app/core/quotes.js
var QUOTES = Object.freeze(
  (Array.isArray(quotes_default?.quotes) ? quotes_default.quotes : []).map((q, i) => Object.freeze({
    id: "q" + i,
    text: String(q.text || "").trim(),
    author: String(q.author || "Unknown").trim() || "Unknown",
    themes: Array.isArray(q.themes) ? q.themes.map(String) : [],
    tone: String(q.tone || "").trim(),
    source: q.source ? String(q.source).trim() : ""
  })).filter((q) => q.text)
);
var TONES = ["inspiring", "wry", "reflective", "defiant", "tender"];
function tally(pairs) {
  const m = /* @__PURE__ */ new Map();
  for (const k of pairs) m.set(k, (m.get(k) || 0) + 1);
  return m;
}
function byCountThenName(a, b) {
  return b.count - a.count || a.value.localeCompare(b.value);
}
function themeFacets(list = QUOTES) {
  const m = tally(list.flatMap((q) => q.themes));
  return [...m].map(([value, count]) => ({ value, count })).sort(byCountThenName);
}
function toneFacets(list = QUOTES) {
  const m = tally(list.map((q) => q.tone).filter(Boolean));
  return TONES.filter((t) => m.has(t)).map((t) => ({ value: t, count: m.get(t) }));
}
function authorFacets(list = QUOTES) {
  const m = tally(list.map((q) => q.author));
  return [...m].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value));
}
function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[‘’“”]/g, "'").trim();
}
function matchesQuery(q, terms) {
  if (!terms.length) return true;
  const hay = norm(q.text + " " + q.author + " " + q.source);
  return terms.every((t) => hay.includes(t));
}
function filterQuotes(facets = {}, list = QUOTES) {
  const themes = (facets.themes || []).filter(Boolean);
  const authors = (facets.authors || []).filter(Boolean);
  const tones = (facets.tones || []).filter(Boolean);
  const terms = norm(facets.query).split(/\s+/).filter(Boolean);
  return list.filter(
    (q) => (!themes.length || q.themes.some((t) => themes.includes(t))) && (!authors.length || authors.includes(q.author)) && (!tones.length || tones.includes(q.tone)) && matchesQuery(q, terms)
  );
}
function formatAttribution(q) {
  if (!q) return "";
  const author = (q.author || "").trim();
  const source = (q.source || "").trim();
  if (!author && !source) return "";
  if (source && author) return author + ", " + source;
  return author || source;
}
function quoteForInsert(q) {
  return { text: (q?.text || "").trim(), cite: formatAttribution(q) };
}

// studio-app/core/postCalendar.js
var postCalendar_exports = {};
__export(postCalendar_exports, {
  MAX_YEAR: () => MAX_YEAR,
  MIN_YEAR: () => MIN_YEAR,
  MONTHS_SHORT: () => MONTHS_SHORT,
  WEEKDAYS: () => WEEKDAYS,
  agendaForMonth: () => agendaForMonth,
  bucketPostsByDay: () => bucketPostsByDay,
  buildMonthGrid: () => buildMonthGrid,
  clampYear: () => clampYear,
  classifyPost: () => classifyPost,
  dayLabel: () => dayLabel,
  isScheduled: () => isScheduled,
  monthLabel: () => monthLabel,
  monthOf: () => monthOf,
  nextMonth: () => nextMonth,
  postDateFor: () => postDateFor,
  postsForDay: () => postsForDay,
  prevMonth: () => prevMonth,
  setMonthYear: () => setMonthYear,
  stepMonth: () => stepMonth,
  toISODate: () => toISODate
});
function isScheduled(p) {
  return !!(p && p.draft && p.publishAt);
}
function classifyPost(p) {
  if (isScheduled(p)) return "scheduled";
  if (p && p.draft) return "draft";
  return "live";
}
function toISODate(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function postDateFor(p) {
  if (!p) return "";
  if (isScheduled(p)) {
    const d = new Date(p.publishAt);
    return isNaN(d) ? "" : toISODate(d);
  }
  const raw = p.date || "";
  return raw ? String(raw).slice(0, 10) : "";
}
function bucketPostsByDay(posts) {
  const byDay = /* @__PURE__ */ new Map();
  for (const p of posts || []) {
    const key = postDateFor(p);
    if (!key) continue;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(p);
  }
  const rank = { live: 0, scheduled: 1, draft: 2 };
  for (const arr of byDay.values()) {
    arr.sort((a, b) => {
      const r = rank[classifyPost(a)] - rank[classifyPost(b)];
      if (r) return r;
      return String(a.title || a.slug || "").localeCompare(String(b.title || b.slug || ""));
    });
  }
  return byDay;
}
function postsForDay(byDay, iso) {
  if (!byDay || typeof byDay.get !== "function" || !iso) return [];
  return byDay.get(iso) || [];
}
function buildMonthGrid(year, month, todayISO = toISODate(/* @__PURE__ */ new Date())) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = toISODate(d);
    cells.push({
      iso,
      day: d.getDate(),
      inMonth: d.getMonth() === month && d.getFullYear() === year,
      isToday: iso === todayISO
    });
  }
  return cells;
}
function stepMonth({ year, month }, delta) {
  const m = month + delta;
  return { year: year + Math.floor(m / 12), month: (m % 12 + 12) % 12 };
}
function prevMonth(ym) {
  return stepMonth(ym, -1);
}
function nextMonth(ym) {
  return stepMonth(ym, 1);
}
var MIN_YEAR = 1970;
var MAX_YEAR = 2999;
function clampYear(year) {
  const y = Math.trunc(Number(year));
  if (!Number.isFinite(y)) return MIN_YEAR;
  return Math.min(MAX_YEAR, Math.max(MIN_YEAR, y));
}
function setMonthYear(year, month) {
  const m = Math.trunc(Number(month));
  const cm = Number.isFinite(m) ? Math.min(11, Math.max(0, m)) : 0;
  return { year: clampYear(year), month: cm };
}
var MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];
function monthLabel({ year, month }) {
  return `${MONTHS[(month % 12 + 12) % 12]} ${year}`;
}
function dayLabel(iso) {
  const d = /* @__PURE__ */ new Date(String(iso) + "T00:00:00");
  if (isNaN(d)) return "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `${wd} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
function monthOf(d = /* @__PURE__ */ new Date()) {
  return { year: d.getFullYear(), month: d.getMonth() };
}
var WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function agendaForMonth(byDay, year, month) {
  const out = [];
  for (const [iso, posts] of byDay.entries()) {
    const d = /* @__PURE__ */ new Date(iso + "T00:00:00");
    if (isNaN(d) || d.getFullYear() !== year || d.getMonth() !== month) continue;
    out.push({ iso, day: d.getDate(), posts });
  }
  return out.sort((a, b) => a.iso.localeCompare(b.iso));
}

// studio-app/core/shareIntents.js
var shareIntents_exports = {};
__export(shareIntents_exports, {
  PLATFORM_CAP: () => PLATFORM_CAP,
  SHARE_PLATFORMS: () => SHARE_PLATFORMS,
  absoluteImageUrl: () => absoluteImageUrl,
  buildIntent: () => buildIntent,
  displayShareUrl: () => displayShareUrl,
  normaliseOrigin: () => normaliseOrigin,
  postImageUrls: () => postImageUrls,
  postLiveUrl: () => postLiveUrl,
  shareIntents: () => shareIntents,
  shareSheetText: () => shareSheetText,
  shareableUrl: () => shareableUrl
});
var DEFAULT_ORIGIN = "https://inayatpanda.com";
function normaliseOrigin(origin) {
  const raw = String(origin || "").trim();
  if (!raw) return DEFAULT_ORIGIN;
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
  } catch {
    return DEFAULT_ORIGIN;
  }
  return u.origin && u.origin !== "null" ? u.origin : DEFAULT_ORIGIN;
}
function displayShareUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  return s.replace(/^https?:\/\//i, "");
}
function shareableUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(mailto|tel):/i.test(s)) return s;
  return "https://" + s.replace(/^\/+/, "");
}
function postLiveUrl(slug, origin) {
  const s = String(slug || "").replace(/^\/+|\/+$/g, "");
  if (!s) return "";
  return normaliseOrigin(origin) + "/blog/" + s + "/";
}
function absoluteImageUrl(ref, origin) {
  const r = String(ref || "").trim();
  if (!r) return "";
  if (/^data:/i.test(r) || /^https?:\/\//i.test(r)) return r;
  if (r.startsWith("/")) return normaliseOrigin(origin) + r;
  return "";
}
function postImageUrls(doc, data, { slug = "", origin } = {}) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (ref, label) => {
    const url = absoluteImageUrl(ref, origin);
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, label });
  };
  const fileUrl = (file) => slug && file ? "/images/posts/" + slug + "/" + file : "";
  if (data && data.image) push(data.image, "Cover");
  for (const b of doc && Array.isArray(doc.blocks) ? doc.blocks : []) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "image") {
      push(b.src || b.url || fileUrl(b.file), "Image");
    } else if (b.type === "figure" && b.base) {
      push(b.base.src || b.base.url || fileUrl(b.base.file), "Figure");
    } else if (b.type === "gallery" && Array.isArray(b.images)) {
      for (const im of b.images) {
        if (!im) continue;
        push(im.src || im.url || fileUrl(im.file), "Gallery");
      }
    }
  }
  return out;
}
var PLATFORM_CAP = {
  x: { label: "X", prefillsText: true, prefillsUrl: true, copyLines: false, webIntent: true },
  linkedin: { label: "LinkedIn", prefillsText: false, prefillsUrl: true, copyLines: true, webIntent: true },
  facebook: { label: "Facebook", prefillsText: false, prefillsUrl: true, copyLines: true, webIntent: true },
  instagram: { label: "Instagram", prefillsText: false, prefillsUrl: false, copyLines: true, webIntent: false }
};
var SHARE_PLATFORMS = ["x", "linkedin", "facebook", "instagram"];
function buildIntent(platform, { lines = "", url = "" } = {}) {
  const key = String(platform || "").toLowerCase();
  const cap = PLATFORM_CAP[key];
  if (!cap) return null;
  const text = String(lines || "");
  const link = String(url || "");
  let href = null;
  if (key === "x") {
    const qs = [];
    if (text) qs.push("text=" + encodeURIComponent(text));
    if (link) qs.push("url=" + encodeURIComponent(link));
    href = "https://twitter.com/intent/tweet" + (qs.length ? "?" + qs.join("&") : "");
  } else if (key === "linkedin") {
    href = link ? "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(link) : "https://www.linkedin.com/feed/?shareActive=true";
  } else if (key === "facebook") {
    href = link ? "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(link) : "https://www.facebook.com/";
  } else if (key === "instagram") {
    href = null;
  }
  const note = !cap.webIntent ? "No web composer \u2014 your text is copied; paste it into Instagram." : cap.copyLines ? "Opens the share dialog with your link. Your text is copied \u2014 paste it in." : "Opens pre-filled with your text and link.";
  return { platform: key, label: cap.label, href, prefillsText: cap.prefillsText, copyLines: cap.copyLines, webIntent: cap.webIntent, note };
}
function shareIntents({ lines = "", url = "" } = {}) {
  return SHARE_PLATFORMS.map((p) => buildIntent(p, { lines, url })).filter(Boolean);
}
function shareSheetText(lines, url) {
  const t = String(lines || "").trim();
  const u = String(url || "").trim();
  if (t && u) return t + "\n\n" + u;
  return t || u;
}

// studio-app/core/postList.js
var postList_exports = {};
__export(postList_exports, {
  isAlreadyDeleted: () => isAlreadyDeleted,
  removeBySlug: () => removeBySlug
});
function removeBySlug(posts, slug) {
  if (!Array.isArray(posts)) return [];
  return posts.filter((p) => p && p.slug !== slug);
}
function isAlreadyDeleted(err) {
  if (!err) return false;
  if (Number(err.status) === 404) return true;
  const text = String(err.message || err.detail || "").toLowerCase();
  return /\bnot found\b|already (?:deleted|gone)/.test(text);
}

// studio-app/lib-entry.js
window.__studioDomain ??= domain_exports;
window.__studioTour ??= tour_exports;
window.__studioQuotes ??= quotes_exports;
window.__studioCalendar ??= postCalendar_exports;
window.__studioShare ??= shareIntents_exports;
window.__studioPostList ??= postList_exports;
