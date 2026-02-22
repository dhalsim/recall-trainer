export type StudyItemType = 'vocab';

export interface StudyItemVocab {
  id: string;
  type: 'vocab';
  source: string;
  target: string;
  description?: string;
  hints?: string;
  acceptedAnswers?: string[];
}

export type StudyItem = StudyItemVocab;

export interface StudySetBase {
  id: string;
  name: string;
  author: string;
  mainLanguage: string;
  targetLanguage: string;
  tags: string[];
  description: string;
  level: number;
  numberOfItems: number;
  type: StudyItemType;
  createdAt: number;
  updatedAt: number;
}

export interface StudySet extends StudySetBase {
  items: StudyItem[];
}

export type StudySetSummary = Omit<StudySet, 'items'>;

export interface StudySetRepository {
  listSets(): Promise<StudySetSummary[]>;
  getSetById(id: string): Promise<StudySet | null>;
}
