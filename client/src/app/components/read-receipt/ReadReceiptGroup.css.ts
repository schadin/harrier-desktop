import { style, StyleRule } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

const circleBase: StyleRule = {
  width: toRem(16),
  height: toRem(16),
  borderRadius: '50%',
  boxSizing: 'border-box',
  boxShadow: `0 0 0 ${config.borderWidth.B300} ${color.Surface.Container}`,
};

export const ReadReceiptGroup = style([
  DefaultReset,
  {
    display: 'inline-flex',
    alignItems: 'center',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    padding: 0,
  },
]);

export const AvatarWrap = style({
  ...circleBase,
  position: 'relative',
  overflow: 'hidden',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  selectors: {
    '&:not(:first-child)': {
      marginLeft: toRem(-4),
    },
  },
});

export const AvatarLetter = style({
  fontSize: toRem(10),
  lineHeight: 1,
  fontWeight: 'bold',
  textTransform: 'uppercase',
});

export const MoreAvatar = style({
  ...circleBase,
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: color.Secondary.Container,
  color: color.Secondary.OnContainer,
  fontSize: toRem(10),
  lineHeight: 1,
  fontWeight: 'bold',
  marginLeft: toRem(-4),
});
