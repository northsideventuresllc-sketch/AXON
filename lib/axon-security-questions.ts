/** Curated security questions for AXON account recovery (15 diverse prompts). */
export const AXON_SECURITY_QUESTIONS = [
  {
    id: 'childhood_street',
    question: 'What street did you grow up on?',
    category: 'childhood',
  },
  {
    id: 'childhood_nickname',
    question: 'What was your childhood nickname?',
    category: 'childhood',
  },
  {
    id: 'childhood_school',
    question: 'What was the name of your elementary school?',
    category: 'childhood',
  },
  {
    id: 'childhood_pet',
    question: 'What was the name of your first pet?',
    category: 'childhood',
  },
  {
    id: 'personal_mother_maiden',
    question: "What is your mother's maiden name?",
    category: 'personal',
  },
  {
    id: 'personal_birth_city',
    question: 'In what city were you born?',
    category: 'personal',
  },
  {
    id: 'personal_best_friend',
    question: 'What is the first name of your childhood best friend?',
    category: 'personal',
  },
  {
    id: 'personal_first_car',
    question: 'What was the make or model of your first car?',
    category: 'personal',
  },
  {
    id: 'preference_favorite_book',
    question: 'What is your favorite book?',
    category: 'preferences',
  },
  {
    id: 'preference_favorite_food',
    question: 'What is your favorite home-cooked meal?',
    category: 'preferences',
  },
  {
    id: 'preference_favorite_movie',
    question: 'What is your all-time favorite movie?',
    category: 'preferences',
  },
  {
    id: 'preference_dream_job',
    question: 'What job did you want as a child?',
    category: 'preferences',
  },
  {
    id: 'memorable_teacher',
    question: 'What was the last name of your favorite teacher?',
    category: 'memorable',
  },
  {
    id: 'memorable_concert',
    question: 'What was the first concert you attended?',
    category: 'memorable',
  },
  {
    id: 'memorable_vacation',
    question: 'Where did you go on your most memorable vacation?',
    category: 'memorable',
  },
] as const;

export type AxonSecurityQuestionId = (typeof AXON_SECURITY_QUESTIONS)[number]['id'];

export type AxonSecurityQuestion = (typeof AXON_SECURITY_QUESTIONS)[number];

export const AXON_SECURITY_QUESTION_BY_ID: Record<AxonSecurityQuestionId, AxonSecurityQuestion> =
  Object.fromEntries(AXON_SECURITY_QUESTIONS.map((q) => [q.id, q])) as Record<
    AxonSecurityQuestionId,
    AxonSecurityQuestion
  >;

export function getSecurityQuestionById(id: string): AxonSecurityQuestion | undefined {
  return AXON_SECURITY_QUESTION_BY_ID[id as AxonSecurityQuestionId];
}

export function isValidSecurityQuestionId(id: string): id is AxonSecurityQuestionId {
  return id in AXON_SECURITY_QUESTION_BY_ID;
}

/** API-friendly list of questions (id + text only). */
export function listSecurityQuestions(): Array<{ id: string; question: string; category: string }> {
  return AXON_SECURITY_QUESTIONS.map(({ id, question, category }) => ({
    id,
    question,
    category,
  }));
}
