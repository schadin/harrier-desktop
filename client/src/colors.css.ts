import { createTheme } from '@vanilla-extract/css';
import { color } from 'folds';

export const silverTheme = createTheme(color, {
  Background: {
    Container: '#DEDEDE',
    ContainerHover: '#D3D3D3',
    ContainerActive: '#C7C7C7',
    ContainerLine: '#BBBBBB',
    OnContainer: '#000000',
  },

  Surface: {
    Container: '#EAEAEA',
    ContainerHover: '#DEDEDE',
    ContainerActive: '#D3D3D3',
    ContainerLine: '#C7C7C7',
    OnContainer: '#000000',
  },

  SurfaceVariant: {
    Container: '#DEDEDE',
    ContainerHover: '#D3D3D3',
    ContainerActive: '#C7C7C7',
    ContainerLine: '#BBBBBB',
    OnContainer: '#000000',
  },

  Primary: {
    Main: '#1245A8',
    MainHover: '#103E97',
    MainActive: '#0F3B8F',
    MainLine: '#0E3786',
    OnMain: '#FFFFFF',
    Container: '#C4D0E9',
    ContainerHover: '#B8C7E5',
    ContainerActive: '#ACBEE1',
    ContainerLine: '#A0B5DC',
    OnContainer: '#0D3076',
  },

  Secondary: {
    Main: '#000000',
    MainHover: '#171717',
    MainActive: '#232323',
    MainLine: '#2F2F2F',
    OnMain: '#EAEAEA',
    Container: '#C7C7C7',
    ContainerHover: '#BBBBBB',
    ContainerActive: '#AFAFAF',
    ContainerLine: '#A4A4A4',
    OnContainer: '#0C0C0C',
  },

  Success: {
    Main: '#017343',
    MainHover: '#01683C',
    MainActive: '#016239',
    MainLine: '#015C36',
    OnMain: '#FFFFFF',
    Container: '#BFDCD0',
    ContainerHover: '#B3D5C7',
    ContainerActive: '#A6CEBD',
    ContainerLine: '#99C7B4',
    OnContainer: '#01512F',
  },

  Warning: {
    Main: '#864300',
    MainHover: '#793C00',
    MainActive: '#723900',
    MainLine: '#6B3600',
    OnMain: '#FFFFFF',
    Container: '#E1D0BF',
    ContainerHover: '#DBC7B2',
    ContainerActive: '#D5BDA6',
    ContainerLine: '#CFB499',
    OnContainer: '#5E2F00',
  },

  Critical: {
    Main: '#9D0F0F',
    MainHover: '#8D0E0E',
    MainActive: '#850D0D',
    MainLine: '#7E0C0C',
    OnMain: '#FFFFFF',
    Container: '#E7C3C3',
    ContainerHover: '#E2B7B7',
    ContainerActive: '#DDABAB',
    ContainerLine: '#D89F9F',
    OnContainer: '#6E0B0B',
  },

  Other: {
    FocusRing: 'rgba(0 0 0 / 50%)',
    Shadow: 'rgba(0 0 0 / 20%)',
    Overlay: 'rgba(0 0 0 / 50%)',
  },
});

const darkThemeData = {
  Background: {
    Container: '#1A1A1A',
    ContainerHover: '#262626',
    ContainerActive: '#333333',
    ContainerLine: '#404040',
    OnContainer: '#F2F2F2',
  },

  Surface: {
    Container: '#262626',
    ContainerHover: '#333333',
    ContainerActive: '#404040',
    ContainerLine: '#4D4D4D',
    OnContainer: '#F2F2F2',
  },

  SurfaceVariant: {
    Container: '#333333',
    ContainerHover: '#404040',
    ContainerActive: '#4D4D4D',
    ContainerLine: '#595959',
    OnContainer: '#F2F2F2',
  },

  Primary: {
    Main: '#BDB6EC',
    MainHover: '#B2AAE9',
    MainActive: '#ADA3E8',
    MainLine: '#A79DE6',
    OnMain: '#2C2843',
    Container: '#413C65',
    ContainerHover: '#494370',
    ContainerActive: '#50497B',
    ContainerLine: '#575086',
    OnContainer: '#E3E1F7',
  },

  Secondary: {
    Main: '#FFFFFF',
    MainHover: '#E5E5E5',
    MainActive: '#D9D9D9',
    MainLine: '#CCCCCC',
    OnMain: '#1A1A1A',
    Container: '#404040',
    ContainerHover: '#4D4D4D',
    ContainerActive: '#595959',
    ContainerLine: '#666666',
    OnContainer: '#F2F2F2',
  },

  Success: {
    Main: '#85E0BA',
    MainHover: '#70DBAF',
    MainActive: '#66D9A9',
    MainLine: '#5CD6A3',
    OnMain: '#0F3D2A',
    Container: '#175C3F',
    ContainerHover: '#1A6646',
    ContainerActive: '#1C704D',
    ContainerLine: '#1F7A54',
    OnContainer: '#CCF2E2',
  },

  Warning: {
    Main: '#E3BA91',
    MainHover: '#DFAF7E',
    MainActive: '#DDA975',
    MainLine: '#DAA36C',
    OnMain: '#3F2A15',
    Container: '#5E3F20',
    ContainerHover: '#694624',
    ContainerActive: '#734D27',
    ContainerLine: '#7D542B',
    OnContainer: '#F3E2D1',
  },

  Critical: {
    Main: '#E69D9D',
    MainHover: '#E28D8D',
    MainActive: '#E08585',
    MainLine: '#DE7D7D',
    OnMain: '#401C1C',
    Container: '#602929',
    ContainerHover: '#6B2E2E',
    ContainerActive: '#763333',
    ContainerLine: '#803737',
    OnContainer: '#F5D6D6',
  },

  Other: {
    FocusRing: 'rgba(255, 255, 255, 0.5)',
    Shadow: 'rgba(0, 0, 0, 1)',
    Overlay: 'rgba(0, 0, 0, 0.8)',
  },
};

export const darkTheme = createTheme(color, darkThemeData);

export const butterTheme = createTheme(color, {
  ...darkThemeData,
  Background: {
    Container: '#1A1916',
    ContainerHover: '#262621',
    ContainerActive: '#33322C',
    ContainerLine: '#403F38',
    OnContainer: '#FFFBDE',
  },

  Surface: {
    Container: '#262621',
    ContainerHover: '#33322C',
    ContainerActive: '#403F38',
    ContainerLine: '#4D4B43',
    OnContainer: '#FFFBDE',
  },

  SurfaceVariant: {
    Container: '#33322C',
    ContainerHover: '#403F38',
    ContainerActive: '#4D4B43',
    ContainerLine: '#59584E',
    OnContainer: '#FFFBDE',
  },

  Secondary: {
    Main: '#FFFBDE',
    MainHover: '#E5E2C8',
    MainActive: '#D9D5BD',
    MainLine: '#CCC9B2',
    OnMain: '#1A1916',
    Container: '#403F38',
    ContainerHover: '#4D4B43',
    ContainerActive: '#59584E',
    ContainerLine: '#666459',
    OnContainer: '#F2EED3',
  },
});

export const draculaTheme = createTheme(color, {
  Background: {
    Container: '#282A36',
    ContainerHover: '#30323F',
    ContainerActive: '#383A48',
    ContainerLine: '#44475A',
    OnContainer: '#F8F8F2',
  },

  Surface: {
    Container: '#2C2E3B',
    ContainerHover: '#343746',
    ContainerActive: '#3B3D4D',
    ContainerLine: '#44475A',
    OnContainer: '#F8F8F2',
  },

  SurfaceVariant: {
    Container: '#343746',
    ContainerHover: '#3B3D4D',
    ContainerActive: '#424556',
    ContainerLine: '#4A4C5F',
    OnContainer: '#F8F8F2',
  },

  Primary: {
    Main: '#BD93F9',
    MainHover: '#C39DF9',
    MainActive: '#C7A4FA',
    MainLine: '#CBA8FB',
    OnMain: '#1F2028',
    Container: '#41385F',
    ContainerHover: '#4A3F6C',
    ContainerActive: '#534679',
    ContainerLine: '#5C4D86',
    OnContainer: '#E6DCFB',
  },

  Secondary: {
    Main: '#F8F8F2',
    MainHover: '#E5E5DF',
    MainActive: '#D9D9D3',
    MainLine: '#CCCCCC',
    OnMain: '#282A36',
    Container: '#44475A',
    ContainerHover: '#4D5064',
    ContainerActive: '#56596E',
    ContainerLine: '#5F6278',
    OnContainer: '#F8F8F2',
  },

  Success: {
    Main: '#50FA7B',
    MainHover: '#64FA8A',
    MainActive: '#70FB93',
    MainLine: '#7BFB9C',
    OnMain: '#0F3D2A',
    Container: '#1A5C3F',
    ContainerHover: '#1D6646',
    ContainerActive: '#20704D',
    ContainerLine: '#237A54',
    OnContainer: '#D3FBE1',
  },

  Warning: {
    Main: '#FFB86C',
    MainHover: '#FFC07D',
    MainActive: '#FFC588',
    MainLine: '#FFCA93',
    OnMain: '#3F2A15',
    Container: '#5E3F20',
    ContainerHover: '#694624',
    ContainerActive: '#734D27',
    ContainerLine: '#7D542B',
    OnContainer: '#FBE6D1',
  },

  Critical: {
    Main: '#FF5555',
    MainHover: '#FF6868',
    MainActive: '#FF7474',
    MainLine: '#FF8080',
    OnMain: '#401C1C',
    Container: '#602929',
    ContainerHover: '#6B2E2E',
    ContainerActive: '#763333',
    ContainerLine: '#803737',
    OnContainer: '#FBD6D6',
  },

  Other: {
    FocusRing: 'rgba(189 147 249 / 60%)',
    Shadow: 'rgba(0 0 0 / 1)',
    Overlay: 'rgba(0 0 0 / 80%)',
  },
});

export const alucardTheme = createTheme(color, {
  Background: {
    Container: '#FFFBEB',
    ContainerHover: '#F3EFDD',
    ContainerActive: '#E8E4D2',
    ContainerLine: '#DED9C6',
    OnContainer: '#1F1F1F',
  },

  Surface: {
    Container: '#F7F3E4',
    ContainerHover: '#EFEBDB',
    ContainerActive: '#E7E2D1',
    ContainerLine: '#DED9C6',
    OnContainer: '#1F1F1F',
  },

  SurfaceVariant: {
    Container: '#EFEBDB',
    ContainerHover: '#E7E2D1',
    ContainerActive: '#DED9C6',
    ContainerLine: '#D5D0BD',
    OnContainer: '#1F1F1F',
  },

  Primary: {
    Main: '#644AC9',
    MainHover: '#6D53D1',
    MainActive: '#735AD6',
    MainLine: '#7A61DA',
    OnMain: '#FFFFFF',
    Container: '#D6D0F2',
    ContainerHover: '#CBC4EE',
    ContainerActive: '#C0B7EA',
    ContainerLine: '#B5ABE6',
    OnContainer: '#3C2B7E',
  },

  Secondary: {
    Main: '#1F1F1F',
    MainHover: '#333333',
    MainActive: '#404040',
    MainLine: '#4D4D4D',
    OnMain: '#FFFBEB',
    Container: '#DED9C6',
    ContainerHover: '#D5D0BD',
    ContainerActive: '#CCC7B4',
    ContainerLine: '#C3BEAB',
    OnContainer: '#1F1F1F',
  },

  Success: {
    Main: '#14710A',
    MainHover: '#127D0B',
    MainActive: '#11850C',
    MainLine: '#108E0D',
    OnMain: '#FFFFFF',
    Container: '#C4E3C0',
    ContainerHover: '#B8DCB3',
    ContainerActive: '#ACD5A6',
    ContainerLine: '#A0CE99',
    OnContainer: '#0D4F07',
  },

  Warning: {
    Main: '#A34D14',
    MainHover: '#B55516',
    MainActive: '#C05A17',
    MainLine: '#CB5F18',
    OnMain: '#FFFFFF',
    Container: '#E7D4C1',
    ContainerHover: '#E1CBB4',
    ContainerActive: '#DBC1A7',
    ContainerLine: '#D5B89A',
    OnContainer: '#7A3A0F',
  },

  Critical: {
    Main: '#CB3A2A',
    MainHover: '#D24231',
    MainActive: '#D64736',
    MainLine: '#DA4C3B',
    OnMain: '#FFFFFF',
    Container: '#F0CCC8',
    ContainerHover: '#ECC0BB',
    ContainerActive: '#E8B4AE',
    ContainerLine: '#E4A8A1',
    OnContainer: '#9C2A1E',
  },

  Other: {
    FocusRing: 'rgba(31 31 31 / 50%)',
    Shadow: 'rgba(0 0 0 / 20%)',
    Overlay: 'rgba(0 0 0 / 50%)',
  },
});
