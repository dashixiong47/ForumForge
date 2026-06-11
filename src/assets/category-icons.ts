type CategoryIconSpec = {
	key: string;
	path: string;
	filename: string;
	svg: string;
	dataUrl: string;
};

function svgDataUrl(svg: string): string {
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function iconSvg(label: string, accent: string, body: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${label}"><defs><linearGradient id="bg" x1="64" y1="48" x2="448" y2="464" gradientUnits="userSpaceOnUse"><stop stop-color="#162238"/><stop offset=".52" stop-color="#08111f"/><stop offset="1" stop-color="#0d2a25"/></linearGradient><linearGradient id="edge" x1="96" y1="88" x2="418" y2="418" gradientUnits="userSpaceOnUse"><stop stop-color="#58a6ff"/><stop offset=".62" stop-color="${accent}"/><stop offset="1" stop-color="#3fb950"/></linearGradient><filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10" result="blur"/><feColorMatrix in="blur" type="matrix" values="0 0 0 0 .35 0 0 0 0 .65 0 0 0 0 1 0 0 0 .38 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="512" height="512" rx="112" fill="#070b12"/><rect x="42" y="42" width="428" height="428" rx="92" fill="url(#bg)" stroke="#26394f" stroke-width="2"/><circle cx="398" cy="116" r="78" fill="${accent}" opacity=".1"/><circle cx="112" cy="404" r="132" fill="#58a6ff" opacity=".06"/><g filter="url(#glow)" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
}

function makeIcon(key: string, label: string, accent: string, body: string): CategoryIconSpec {
	const svg = iconSvg(label, accent, body);
	return {
		key: `system/category-${key}.svg`,
		path: `/assets/category-icons/${key}.svg`,
		filename: `category-${key}.svg`,
		svg,
		dataUrl: svgDataUrl(svg),
	};
}

export const CATEGORY_ICONS = {
	announcements: makeIcon(
		'announcements',
		'Announcements',
		'#5eead4',
		'<path d="M154 278h-28c-22 0-40-18-40-40s18-40 40-40h28l178-66v212l-178-66Z" fill="#0f172a" stroke="url(#edge)" stroke-width="22"/><path d="M154 278l28 80c5 14 18 24 34 24h34l-42-92" fill="#0f172a" stroke="#8cc8ff" stroke-width="20"/><path d="M378 186c22 25 22 78 0 104M414 146c48 54 48 164 0 218" fill="none" stroke="#3fb950" stroke-width="18"/><circle cx="122" cy="238" r="12" fill="#f8fafc"/>'
	),
	webuix: makeIcon(
		'webuix',
		'WebUIX',
		'#60a5fa',
		'<rect x="104" y="120" width="304" height="232" rx="28" fill="#0f172a" stroke="url(#edge)" stroke-width="22"/><path d="M104 176h304" stroke="#8cc8ff" stroke-width="20"/><circle cx="146" cy="148" r="10" fill="#58a6ff"/><circle cx="178" cy="148" r="10" fill="#5eead4"/><circle cx="210" cy="148" r="10" fill="#3fb950"/><path d="M166 254l42-38m-42 38 42 38M346 254l-42-38m42 38-42 38" fill="none" stroke="#e6edf3" stroke-width="20"/><path d="M244 310l28-112" stroke="#58a6ff" stroke-width="18"/>'
	),
	help: makeIcon(
		'help',
		'Help',
		'#f5d76e',
		'<circle cx="256" cy="244" r="132" fill="#0f172a" stroke="url(#edge)" stroke-width="22"/><path d="M216 208c6-38 36-60 76-52 36 8 58 38 50 72-7 29-31 44-56 59-18 11-28 23-30 45" fill="none" stroke="#e6edf3" stroke-width="24"/><circle cx="256" cy="378" r="16" fill="#f5d76e"/><path d="M140 390l-28 66 70-28" fill="#0f172a" stroke="#58a6ff" stroke-width="18"/>'
	),
	showcase: makeIcon(
		'showcase',
		'Showcase',
		'#a78bfa',
		'<rect x="104" y="124" width="304" height="264" rx="28" fill="#0f172a" stroke="url(#edge)" stroke-width="22"/><circle cx="186" cy="198" r="32" fill="#58a6ff" opacity=".9"/><path d="M128 344l86-86c18-18 47-18 65 0l24 24 38-38c17-17 44-17 61 0l6 6" fill="none" stroke="#e6edf3" stroke-width="22"/><path d="M150 96h212M166 426h180" stroke="#a78bfa" stroke-width="18"/>'
	),
	general: makeIcon(
		'general',
		'General',
		'#34d399',
		'<path d="M126 162c0-34 28-62 62-62h136c34 0 62 28 62 62v92c0 34-28 62-62 62h-82l-82 72v-72h-34c-34 0-62-28-62-62v-92Z" fill="#0f172a" stroke="url(#edge)" stroke-width="22"/><path d="M160 176h178M160 226h132M160 276h88" stroke="#e6edf3" stroke-width="20"/><circle cx="360" cy="350" r="44" fill="#34d399" opacity=".18" stroke="#34d399" stroke-width="16"/>'
	),
} as const;

export type CategoryIconKey = keyof typeof CATEGORY_ICONS;
