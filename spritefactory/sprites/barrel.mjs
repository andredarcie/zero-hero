// Wooden barrel — a village prop. Style anchors: rock.png (flat hard-edged light/shadow split,
// 1-2px ground margin), vase.png (the ink navy as structural dark), wood ramp for the staves.
// Light from the left like everything in this game; the two hoops are ink navy, not black.

export default {
  name: 'barrel',
  kind: 'prop',
  palette: {
    A: '#63452c', // dark wood — seams, shadow side, rims
    B: '#815938', // base wood
    C: '#886644', // lit wood (left)
    D: '#1d2b53', // ink navy hoops
  },
  frames: [[
    '................',
    '................',
    '....AAAAAAAA....',
    '...ACCBBBBBBA...',
    '...DDDDDDDDDD...',
    '..CCCABBABBAAA..',
    '.CCCCABBABBAAAA.',
    '.CCCCABBABBAAAA.',
    '.CCCCABBABBAAAA.',
    '..CCCABBABBAAA..',
    '..CCCABBABBAAA..',
    '...DDDDDDDDDD...',
    '...CCABBABBAA...',
    '....AAAAAAAA....',
    '................',
    '................',
  ]],
  notes: 'Wood ramp #63452c/#815938/#886644 + ink hoops. Flat left-light like rock.png. '
    + 'Bulge in the middle rows (14 wide) tapering to 8 at the rims — the boxy first draft read as a crate.',
};
