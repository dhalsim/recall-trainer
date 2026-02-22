import type { StudySet, StudySetRepository, StudySetSummary } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

const MOCK_STUDY_SETS: StudySet[] = [
  {
    id: 'studyset-jp-food-basic',
    name: 'Japanese Food Basics',
    author: 'npub_mock_food_author',
    mainLanguage: 'en',
    targetLanguage: 'ja',
    tags: ['food', 'daily-life'],
    description: 'Core food terms for beginner learners.',
    level: 2,
    numberOfItems: 6,
    type: 'vocab',
    createdAt: now - 12 * DAY_MS,
    updatedAt: now - 2 * DAY_MS,
    items: [
      { id: 'jp-food-1', type: 'vocab', source: 'rice', target: 'ごはん' },
      { id: 'jp-food-2', type: 'vocab', source: 'water', target: 'みず' },
      { id: 'jp-food-3', type: 'vocab', source: 'tea', target: 'おちゃ' },
      { id: 'jp-food-4', type: 'vocab', source: 'fish', target: 'さかな' },
      { id: 'jp-food-5', type: 'vocab', source: 'meat', target: 'にく' },
      { id: 'jp-food-6', type: 'vocab', source: 'vegetable', target: 'やさい' },
    ],
  },
  {
    id: 'studyset-jp-travel-a1',
    name: 'Travel Survival A1',
    author: 'npub_mock_travel_author',
    mainLanguage: 'en',
    targetLanguage: 'ja',
    tags: ['travel', 'survival'],
    description: 'Useful terms for stations, hotels, and simple travel needs.',
    level: 3,
    numberOfItems: 7,
    type: 'vocab',
    createdAt: now - 20 * DAY_MS,
    updatedAt: now - 3 * DAY_MS,
    items: [
      { id: 'jp-travel-1', type: 'vocab', source: 'station', target: 'えき' },
      { id: 'jp-travel-2', type: 'vocab', source: 'ticket', target: 'きっぷ' },
      { id: 'jp-travel-3', type: 'vocab', source: 'hotel', target: 'ホテル' },
      { id: 'jp-travel-4', type: 'vocab', source: 'airport', target: 'くうこう' },
      { id: 'jp-travel-5', type: 'vocab', source: 'taxi', target: 'タクシー' },
      { id: 'jp-travel-6', type: 'vocab', source: 'left', target: 'ひだり' },
      { id: 'jp-travel-7', type: 'vocab', source: 'right', target: 'みぎ' },
    ],
  },
  {
    id: 'studyset-jp-tech-b1',
    name: 'Tech Terms B1',
    author: 'npub_mock_tech_author',
    mainLanguage: 'en',
    targetLanguage: 'ja',
    tags: ['technology', 'work'],
    description: 'Common software and internet terms used at work.',
    level: 5,
    numberOfItems: 8,
    type: 'vocab',
    createdAt: now - 8 * DAY_MS,
    updatedAt: now - DAY_MS,
    items: [
      { id: 'jp-tech-1', type: 'vocab', source: 'server', target: 'サーバー' },
      { id: 'jp-tech-2', type: 'vocab', source: 'database', target: 'データベース' },
      { id: 'jp-tech-3', type: 'vocab', source: 'network', target: 'ネットワーク' },
      { id: 'jp-tech-4', type: 'vocab', source: 'security', target: 'セキュリティ' },
      { id: 'jp-tech-5', type: 'vocab', source: 'account', target: 'アカウント' },
      { id: 'jp-tech-6', type: 'vocab', source: 'update', target: 'アップデート' },
      { id: 'jp-tech-7', type: 'vocab', source: 'password', target: 'パスワード' },
      {
        id: 'jp-tech-8',
        type: 'vocab',
        source: 'login',
        target: 'ログイン',
        acceptedAnswers: ['log in'],
      },
    ],
  },
];

function toSummary(set: StudySet): StudySetSummary {
  const { items: _items, ...summary } = set;

  return summary;
}

export class MockStudySetRepository implements StudySetRepository {
  async listSets(): Promise<StudySetSummary[]> {
    return MOCK_STUDY_SETS.map(toSummary);
  }

  async getSetById(id: string): Promise<StudySet | null> {
    return MOCK_STUDY_SETS.find((set) => set.id === id) ?? null;
  }
}

export const mockStudySetRepository = new MockStudySetRepository();
