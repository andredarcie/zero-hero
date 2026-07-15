// Wooden barrel — a village prop. Style anchors: rock.png (flat hard-edged light/shadow split,
// 1-2px ground margin), vase.png (the ink navy as structural dark), wood ramp for the staves.
// Light from the left like everything in this game; the two hoops are ink navy, not black.

export default {
  name: 'barrel',
  kind: 'prop',
  palette: {
    A: '#63452c', // dark wood — seams, shadow side, rims
    B: '#815938', // base wood
    C: '#886644', // mid-lit wood
    L: '#b7916a', // highlight — full top of the wood ramp; v2 stopped at C and read flat
    D: '#1d2b53', // ink navy hoop base
    E: '#324476', // hoop catching the light (left end)
    F: '#141d38', // hoop shadow (right end)
  },
  frames: [[
    '................',
    '................',
    '....LLCCCBBA....',
    '...ACCBBBBBAA...',
    '...EEDDDDDDFF...',
    '..CLLCBABBAAAA..',
    '.CLLLCBBABBAAAA.',
    '.CLLLCBBABBAAAA.',
    '.CLLCBBBABBAAAA.',
    '..CLLCBABBAAAA..',
    '..CCLCBABBAAAA..',
    '...EDDDDDDDFF...',
    '...CCCBABBAAA...',
    '....AAAAAAAA....',
    '................',
    '................',
  ]],
  notes: 'v3, after "muito chapado" feedback. Fixes, all classic pixel-art practice applied inside '
    + 'the game palette: full value range of the wood ramp (highlight #b7916a was unused in v2); '
    + 'cylinder highlight as a BAND ~20% in from the lit edge that tapers at top/bottom of the '
    + 'bulge, instead of stripe shading glued to the silhouette; hoops shaded with the ink ramp '
    + '(#324476 lit end, #141d38 shadow end) like vase.png does; stave seams shift out one column '
    + 'at the bulge rows so the planks bow with the form; bottom row all-dark as ground contact.',
};
