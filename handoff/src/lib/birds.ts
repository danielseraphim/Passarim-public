export type Bird = {
  key: 'bemtevi' | 'sabia' | 'uirapuru' | 'azulao' | 'tiesangue' | 'sanhacu';
  name: string;
  hex: string;
  desc: string;
};

export const birds: Bird[] = [
  {
    key: 'bemtevi',
    name: 'bem-te-vi',
    hex: '#F2C94C',
    desc: 'o guardião da manhã, canto claro que abre o dia na natureza.',
  },
  {
    key: 'sabia',
    name: 'sabiá',
    hex: '#E67E22',
    desc: 'poeta da paisagem, seu canto é memória e tradição.',
  },
  {
    key: 'uirapuru',
    name: 'uirapuru',
    hex: '#E74C3C',
    desc: 'raro e misterioso, seu canto ecoa como encantamento da mata.',
  },
  {
    key: 'azulao',
    name: 'azulão',
    hex: '#2D7DD2',
    desc: 'força e beleza, seu canto é firme e marcante.',
  },
  {
    key: 'tiesangue',
    name: 'tiê-sangue',
    hex: '#6BAF6B',
    desc: 'pequeno notável, seu canto é alegria que contagia.',
  },
  {
    key: 'sanhacu',
    name: 'sanhaçu',
    hex: '#A48DBA',
    desc: 'cores que cantam, sua presença é pura vibração.',
  },
];

export const iconUrl = (key: Bird['key']) => `/icons/${key}.svg`;
