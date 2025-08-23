export type UUID = string;
export type Timestamp = number;
export type Vector = number[];

export enum TaskType {
  BELIEF = 'BELIEF',
  GOAL = 'GOAL',
  QUESTION = 'QUESTION',
  QUEST = 'QUEST',
  PROCEDURE = 'PROCEDURE',
}