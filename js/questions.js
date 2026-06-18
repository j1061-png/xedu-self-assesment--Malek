/**
 * Seven assessment questions — asked after chat, before AI feedback.
 */
const QUESTIONS = [
  {
    id: "currentGrade",
    field: "currentGrade",
    type: "text",
    title: "What grade are you currently in?",
    subtitle: "e.g. Grade 9, Grade 10, Grade 11, Grade 12",
    placeholder: "e.g. Grade 11",
    minLength: 2,
  },
  {
    id: "subjects",
    field: "subjects",
    type: "text",
    title: "What subjects are you currently studying, and which ones do you perform best in?",
    subtitle: "List your subjects and say where you're strongest.",
    placeholder: "e.g. A-Levels in Maths, Chemistry and Biology. Strongest in Maths and Chemistry — consistently top of class…",
    minLength: 25,
  },
  {
    id: "academicChallenges",
    field: "academicChallenges",
    type: "text",
    title: "What academic challenges are you currently facing?",
    subtitle: "Grades, subjects, study habits, exams — whatever is hardest right now.",
    placeholder: "e.g. Struggling to keep up in English. Predicted grades dropped in my last mock…",
    minLength: 25,
  },
  {
    id: "extracurriculars",
    field: "extracurriculars",
    type: "text",
    title: "What extracurricular activities, leadership roles, competitions, projects, or volunteering experiences are you involved in?",
    subtitle: "Include what you do and your role — even if the list is short.",
    placeholder: "e.g. Football team captain, hospital volunteering on Saturdays, school science fair project on renewable energy…",
    minLength: 25,
  },
  {
    id: "proudestAchievement",
    field: "proudestAchievement",
    type: "text",
    title: "What achievement are you most proud of?",
    subtitle: "Academic, personal, or extracurricular — and why it matters to you.",
    placeholder: "e.g. Getting selected for the regional maths competition after months of prep…",
    minLength: 25,
  },
  {
    id: "extracurricularHours",
    field: "extracurricularHours",
    type: "text",
    title: "How many hours per week do you spend on extracurricular activities?",
    subtitle: "A rough estimate is fine — include sports, clubs, volunteering, etc.",
    placeholder: "e.g. About 8 hours — 4 football, 2 volunteering, 2 debate club",
    minLength: 2,
  },
  {
    id: "assessmentFocus",
    field: "assessmentFocus",
    type: "text",
    title: "What would you like the AI to assess about you today?",
    subtitle: "e.g. university competitiveness, leadership, balance between academics and extracurriculars, career readiness",
    placeholder: "e.g. How competitive am I for Russell Group universities given my profile?",
    minLength: 15,
    highlight: true,
  },
];

function scoreLabel(percent) {
  if (percent >= 85) return { label: "Excellent", color: "#6da82a" };
  if (percent >= 70) return { label: "Strong", color: "#8cc63f" };
  if (percent >= 55) return { label: "Developing", color: "#f7941d" };
  if (percent >= 40) return { label: "Needs work", color: "#e67e22" };
  return { label: "Early stage", color: "#e74c3c" };
}

function buildAnalyzePayload(answers, chatContext, assessmentFocus, questions) {
  const qa = (questions || QUESTIONS).map((q) => ({
    id: q.field || q.id,
    question: q.title,
    answer: answers[q.field] || answers[q.id] || "",
  }));

  return {
    assessmentFocus: answers.assessmentFocus || assessmentFocus || "",
    chatContext,
    answers,
    questions: qa,
  };
}
