import type { AcademicDomainId, CareerProfile, LearningResource } from '../core/types';

export interface CourseOption {
  id: string;
  name: string;
  domainId: AcademicDomainId;
  mappedCareerId: string;
  defaultSubjects: string[];
  isCustom?: boolean;
}

export interface AcademicDomainMeta {
  id: AcademicDomainId;
  title: string;
  name: string;
  subtitle: string;
  description: string;
  isTechOriented: boolean;
  supportsGitHubProjects: boolean;
  artifactLabel: string;
  defaultCareerId: string;
  courses: CourseOption[];
}

export type DomainMeta = AcademicDomainMeta;

export const LEARNING_GOAL_OPTIONS = [
  {
    id: 'core-mastery',
    title: 'Master Core Coursework & Exams',
    description: 'Build strong conceptual command across your current semester subjects.',
  },
  {
    id: 'career-readiness',
    title: 'Prepare for Placements & Career Roles',
    description: 'Close priority competency gaps with structured diagnostics and practice.',
  },
  {
    id: 'practical-evidence',
    title: 'Build Practical Portfolio & Case Evidence',
    description: 'Convert academic knowledge into demonstrable projects or case analyses.',
  },
  {
    id: 'skill-switch',
    title: 'Explore or Transition to a Specialization',
    description: 'Transfer proven strengths while charting a clear path into a new focus.',
  },
  {
    id: 'daily-consistency',
    title: 'Stay Consistent with Guided Study Habits',
    description: 'Follow realistic weekly milestones tailored to your available study hours.',
  },
  {
    id: 'ai-mentorship',
    title: 'Get Step-by-Step AI Mentor Guidance',
    description: 'Unblock tough concepts with progressive hints rather than spoon-fed answers.',
  },
] as const;

const RAW_ACADEMIC_DOMAINS: Omit<AcademicDomainMeta, 'name' | 'description' | 'supportsGitHubProjects'>[] = [
  {
    id: 'engineering',
    title: 'Engineering',
    subtitle: 'CSE, IT, ECE, EEE, Mechanical, Civil and more',
    isTechOriented: true,
    artifactLabel: 'Projects & GitHub',
    defaultCareerId: 'full-stack-developer',
    courses: [
      { id: 'eng-cse', name: 'Computer Science Engineering', domainId: 'engineering', mappedCareerId: 'full-stack-developer', defaultSubjects: ['Programming', 'Mathematics', 'Logical Reasoning', 'Data Fundamentals'] },
      { id: 'eng-it', name: 'Information Technology', domainId: 'engineering', mappedCareerId: 'full-stack-developer', defaultSubjects: ['Programming', 'Networking & Web', 'Databases', 'Logical Reasoning'] },
      { id: 'eng-ece', name: 'Electronics and Communication', domainId: 'engineering', mappedCareerId: 'embedded-systems-engineer', defaultSubjects: ['Signals & Circuits', 'Digital Logic', 'Engineering Mathematics', 'Programming'] },
      { id: 'eng-eee', name: 'Electrical and Electronics', domainId: 'engineering', mappedCareerId: 'embedded-systems-engineer', defaultSubjects: ['Circuit Analysis', 'Power & Control', 'Engineering Mathematics', 'Logical Reasoning'] },
      { id: 'eng-mech', name: 'Mechanical Engineering', domainId: 'engineering', mappedCareerId: 'core-engineering-analyst', defaultSubjects: ['Thermodynamics & Mechanics', 'Materials & Design', 'Engineering Mathematics', 'Logical Reasoning'] },
      { id: 'eng-civil', name: 'Civil Engineering', domainId: 'engineering', mappedCareerId: 'core-engineering-analyst', defaultSubjects: ['Structural Mechanics', 'Materials & Surveying', 'Engineering Mathematics', 'Logical Reasoning'] },
      { id: 'eng-other', name: 'Other Engineering', domainId: 'engineering', mappedCareerId: 'core-engineering-analyst', defaultSubjects: ['Engineering Mathematics', 'Core Mechanics', 'Programming Basics', 'Logical Reasoning'], isCustom: true },
    ],
  },
  {
    id: 'medical',
    title: 'Medical & Healthcare',
    subtitle: 'MBBS, Nursing, Pharmacy, Physiotherapy and more',
    isTechOriented: false,
    artifactLabel: 'Clinical Cases & Logs',
    defaultCareerId: 'clinical-healthcare-track',
    courses: [
      { id: 'med-mbbs', name: 'MBBS', domainId: 'medical', mappedCareerId: 'clinical-healthcare-track', defaultSubjects: ['Human Anatomy', 'Physiology', 'Biochemistry', 'Clinical Reasoning'] },
      { id: 'med-nursing', name: 'Nursing', domainId: 'medical', mappedCareerId: 'clinical-healthcare-track', defaultSubjects: ['Anatomy & Physiology', 'Patient Care & Ethics', 'Pharmacology Basics', 'Clinical Reasoning'] },
      { id: 'med-pharmacy', name: 'Pharmacy', domainId: 'medical', mappedCareerId: 'pharma-health-track', defaultSubjects: ['Pharmacology', 'Medicinal Chemistry', 'Human Physiology', 'Clinical Dosing'] },
      { id: 'med-physio', name: 'Physiotherapy', domainId: 'medical', mappedCareerId: 'clinical-healthcare-track', defaultSubjects: ['Musculoskeletal Anatomy', 'Kinesiology & Physiology', 'Rehabilitation', 'Clinical Reasoning'] },
      { id: 'med-dentistry', name: 'Dentistry', domainId: 'medical', mappedCareerId: 'clinical-healthcare-track', defaultSubjects: ['Head & Neck Anatomy', 'Oral Pathology Basics', 'Physiology', 'Clinical Reasoning'] },
      { id: 'med-mlt', name: 'Medical Laboratory Technology', domainId: 'medical', mappedCareerId: 'pharma-health-track', defaultSubjects: ['Clinical Biochemistry', 'Microbiology & Pathology', 'Hematology', 'Lab Safety & QA'] },
      { id: 'med-other', name: 'Other Healthcare Courses', domainId: 'medical', mappedCareerId: 'clinical-healthcare-track', defaultSubjects: ['Anatomy & Physiology', 'Biochemistry', 'Patient Safety', 'Clinical Reasoning'], isCustom: true },
    ],
  },
  {
    id: 'commerce',
    title: 'Commerce & Finance',
    subtitle: 'B.Com, Accounting, Finance, Banking and more',
    isTechOriented: false,
    artifactLabel: 'Case Studies & Models',
    defaultCareerId: 'financial-analytics-track',
    courses: [
      { id: 'com-bcom', name: 'B.Com', domainId: 'commerce', mappedCareerId: 'financial-analytics-track', defaultSubjects: ['Financial Accounting', 'Business Economics', 'Corporate Finance', 'Quantitative Aptitude'] },
      { id: 'com-acc', name: 'Accounting', domainId: 'commerce', mappedCareerId: 'financial-analytics-track', defaultSubjects: ['Financial Statements', 'Cost & Management Accounting', 'Auditing Standards', 'Quantitative Aptitude'] },
      { id: 'com-fin', name: 'Finance', domainId: 'commerce', mappedCareerId: 'financial-analytics-track', defaultSubjects: ['Corporate Finance', 'Valuation & Time Value', 'Financial Accounting', 'Quantitative Aptitude'] },
      { id: 'com-bank', name: 'Banking', domainId: 'commerce', mappedCareerId: 'financial-analytics-track', defaultSubjects: ['Banking Operations & Risk', 'Macroeconomics', 'Financial Accounting', 'Quantitative Aptitude'] },
      { id: 'com-ba', name: 'Business Analytics', domainId: 'commerce', mappedCareerId: 'data-analyst', defaultSubjects: ['Descriptive Statistics', 'Spreadsheet & SQL Logic', 'Financial Metrics', 'Business Interpretation'] },
      { id: 'com-tax', name: 'Taxation', domainId: 'commerce', mappedCareerId: 'financial-analytics-track', defaultSubjects: ['Direct & Indirect Tax', 'Accounting Principles', 'Compliance & Ethics', 'Quantitative Aptitude'] },
    ],
  },
  {
    id: 'arts',
    title: 'Arts & Humanities',
    subtitle: 'English, Psychology, History, Economics and more',
    isTechOriented: false,
    artifactLabel: 'Essays & Research',
    defaultCareerId: 'humanities-research-track',
    courses: [
      { id: 'art-eng', name: 'English', domainId: 'arts', mappedCareerId: 'humanities-research-track', defaultSubjects: ['Critical Reading & Rhetoric', 'Literary Analysis', 'Academic Writing', 'Logical Reasoning'] },
      { id: 'art-psy', name: 'Psychology', domainId: 'arts', mappedCareerId: 'humanities-research-track', defaultSubjects: ['Cognitive & Behavioral Science', 'Research Methods', 'Statistics in Psychology', 'Critical Reasoning'] },
      { id: 'art-his', name: 'History', domainId: 'arts', mappedCareerId: 'humanities-research-track', defaultSubjects: ['Historiography & Sources', 'Global Civilizations', 'Analytical Writing', 'Critical Reasoning'] },
      { id: 'art-eco', name: 'Economics', domainId: 'arts', mappedCareerId: 'humanities-research-track', defaultSubjects: ['Microeconomics', 'Macroeconomics', 'Quantitative Methods', 'Policy Analysis'] },
      { id: 'art-soc', name: 'Sociology', domainId: 'arts', mappedCareerId: 'humanities-research-track', defaultSubjects: ['Social Theory', 'Qualitative & Survey Methods', 'Public Policy', 'Critical Reasoning'] },
      { id: 'art-pol', name: 'Political Science', domainId: 'arts', mappedCareerId: 'humanities-research-track', defaultSubjects: ['Political Theory', 'Constitutional Governance', 'International Relations', 'Analytical Writing'] },
    ],
  },
  {
    id: 'ai-tech',
    title: 'AI & Technology',
    subtitle: 'AI/ML, Data Science, Cybersecurity, Cloud',
    isTechOriented: true,
    artifactLabel: 'Projects & GitHub',
    defaultCareerId: 'ai-ml-engineer',
    courses: [
      { id: 'ai-ml', name: 'Artificial Intelligence and Machine Learning', domainId: 'ai-tech', mappedCareerId: 'ai-ml-engineer', defaultSubjects: ['Python Programming', 'Probability & Statistics', 'Linear Algebra & Calculus', 'Machine Learning Basics'] },
      { id: 'ai-ds', name: 'Data Science', domainId: 'ai-tech', mappedCareerId: 'data-scientist', defaultSubjects: ['Python & Data Structures', 'Statistics & Hypothesis Testing', 'SQL & Data Modeling', 'ML Foundations'] },
      { id: 'ai-sec', name: 'Cybersecurity', domainId: 'ai-tech', mappedCareerId: 'cybersecurity-analyst', defaultSubjects: ['Web & App Security', 'Networking & Auth', 'Scripting & Logs', 'Logical Reasoning'] },
      { id: 'ai-cloud', name: 'Cloud Computing', domainId: 'ai-tech', mappedCareerId: 'cloud-engineer', defaultSubjects: ['Containers & Linux', 'Networking & APIs', 'Automation Scripting', 'System Reliability'] },
      { id: 'ai-fs', name: 'Full Stack Development', domainId: 'ai-tech', mappedCareerId: 'full-stack-developer', defaultSubjects: ['Frontend & DOM', 'JavaScript & Async', 'Backend & REST APIs', 'SQL & Data Modeling'] },
      { id: 'ai-se', name: 'Software Engineering', domainId: 'ai-tech', mappedCareerId: 'backend-developer', defaultSubjects: ['Programming & Data Structures', 'System Design & APIs', 'Databases & SQL', 'Testing & Git'] },
      { id: 'ai-iot', name: 'Internet of Things', domainId: 'ai-tech', mappedCareerId: 'embedded-systems-engineer', defaultSubjects: ['Embedded Systems', 'Networking & Protocols', 'Python & Scripting', 'Data Telemetry'] },
    ],
  },
  {
    id: 'management',
    title: 'Management',
    subtitle: 'BBA, MBA, Marketing, HR, Business',
    isTechOriented: false,
    artifactLabel: 'Strategy Cases',
    defaultCareerId: 'business-management-track',
    courses: [
      { id: 'mgt-bba', name: 'BBA', domainId: 'management', mappedCareerId: 'business-management-track', defaultSubjects: ['Management Principles', 'Marketing & Strategy', 'Managerial Economics', 'Quantitative Reasoning'] },
      { id: 'mgt-mba', name: 'MBA', domainId: 'management', mappedCareerId: 'business-management-track', defaultSubjects: ['Corporate Strategy', 'Financial Decision Making', 'Operations & Analytics', 'Leadership & Org Behavior'] },
      { id: 'mgt-mkt', name: 'Marketing', domainId: 'management', mappedCareerId: 'business-management-track', defaultSubjects: ['Consumer Behavior', 'Brand & Go-To-Market', 'Marketing Metrics & ROI', 'Strategic Communication'] },
      { id: 'mgt-hr', name: 'Human Resource Management', domainId: 'management', mappedCareerId: 'business-management-track', defaultSubjects: ['Organizational Behavior', 'Talent & Performance Systems', 'People Analytics', 'Workplace Ethics'] },
      { id: 'mgt-bus', name: 'Business Management', domainId: 'management', mappedCareerId: 'business-management-track', defaultSubjects: ['Operations Management', 'Strategic Planning', 'Financial Literacy', 'Decision Analysis'] },
    ],
  },
  {
    id: 'law',
    title: 'Law',
    subtitle: 'LLB, Corporate Law, Criminal Law, Legal Studies',
    isTechOriented: false,
    artifactLabel: 'Case Briefs & Memos',
    defaultCareerId: 'legal-studies-track',
    courses: [
      { id: 'law-llb', name: 'LLB', domainId: 'law', mappedCareerId: 'legal-studies-track', defaultSubjects: ['Constitutional Principles', 'Contract & Tort Law', 'Legal Reasoning', 'Statutory Interpretation'] },
      { id: 'law-corp', name: 'Corporate Law', domainId: 'law', mappedCareerId: 'legal-studies-track', defaultSubjects: ['Corporate Governance', 'Contract Drafting & Liability', 'Regulatory Compliance', 'Legal Reasoning'] },
      { id: 'law-crim', name: 'Criminal Law', domainId: 'law', mappedCareerId: 'legal-studies-track', defaultSubjects: ['Criminal Liability & Mens Rea', 'Evidence & Procedure', 'Constitutional Safeguards', 'Legal Reasoning'] },
      { id: 'law-studies', name: 'Legal Studies', domainId: 'law', mappedCareerId: 'legal-studies-track', defaultSubjects: ['Jurisprudence', 'Constitutional Law', 'Contract Fundamentals', 'Critical Argumentation'] },
    ],
  },
  {
    id: 'other',
    title: 'Other',
    subtitle: 'Explore other courses and specializations',
    isTechOriented: false,
    artifactLabel: 'Portfolio & Reflections',
    defaultCareerId: 'interdisciplinary-foundations-track',
    courses: [
      { id: 'oth-custom-course', name: 'Custom course', domainId: 'other', mappedCareerId: 'interdisciplinary-foundations-track', defaultSubjects: ['Critical Reasoning', 'Quantitative Literacy', 'Structured Communication', 'Research & Synthesis'], isCustom: true },
      { id: 'oth-custom-spec', name: 'Custom specialization', domainId: 'other', mappedCareerId: 'interdisciplinary-foundations-track', defaultSubjects: ['Critical Reasoning', 'Analytical Problem Solving', 'Communication', 'Self-Directed Learning'], isCustom: true },
      { id: 'oth-exploring', name: 'Still exploring', domainId: 'other', mappedCareerId: 'interdisciplinary-foundations-track', defaultSubjects: ['Logical Reasoning', 'Quantitative Literacy', 'Communication & Synthesis', 'Study Strategy'] },
    ],
  },
];

export const ACADEMIC_DOMAINS: AcademicDomainMeta[] = RAW_ACADEMIC_DOMAINS.map((domain) => ({
  ...domain,
  name: domain.title,
  description: domain.subtitle,
  supportsGitHubProjects: domain.isTechOriented,
}));

export const DOMAIN_RESOURCES: LearningResource[] = [
  {
    id: 'res-openstax-anat',
    skillId: 'clinical-anatomy',
    title: 'OpenStax Anatomy and Physiology 2e',
    provider: 'OpenStax (Rice University)',
    url: 'https://openstax.org/details/books/anatomy-and-physiology-2e',
    format: 'Documentation',
    estimatedMinutes: 180,
    verified: true,
  },
  {
    id: 'res-openstax-bio',
    skillId: 'biochemistry-pharma',
    title: 'OpenStax Biology & Cellular Pathways',
    provider: 'OpenStax',
    url: 'https://openstax.org/details/books/biology-2e',
    format: 'Documentation',
    estimatedMinutes: 160,
    verified: true,
  },
  {
    id: 'res-nih-ebm',
    skillId: 'clinical-reasoning',
    title: 'NIH Evidence-Based Clinical Decision Making',
    provider: 'National Library of Medicine',
    url: 'https://www.ncbi.nlm.nih.gov/books/',
    format: 'Guide',
    estimatedMinutes: 140,
    verified: true,
  },
  {
    id: 'res-openstax-acc',
    skillId: 'financial-accounting',
    title: 'OpenStax Principles of Financial Accounting',
    provider: 'OpenStax',
    url: 'https://openstax.org/details/books/principles-financial-accounting',
    format: 'Documentation',
    estimatedMinutes: 180,
    verified: true,
  },
  {
    id: 'res-cfa-finance',
    skillId: 'corporate-finance',
    title: 'OpenStax Principles of Finance',
    provider: 'OpenStax',
    url: 'https://openstax.org/details/books/principles-finance',
    format: 'Documentation',
    estimatedMinutes: 160,
    verified: true,
  },
  {
    id: 'res-openstax-econ',
    skillId: 'economics-analysis',
    title: 'OpenStax Principles of Economics 3e',
    provider: 'OpenStax',
    url: 'https://openstax.org/details/books/principles-economics-3e',
    format: 'Documentation',
    estimatedMinutes: 150,
    verified: true,
  },
  {
    id: 'res-openstax-psy',
    skillId: 'research-methods',
    title: 'OpenStax Psychology & Scientific Inquiry',
    provider: 'OpenStax',
    url: 'https://openstax.org/details/books/psychology-2e',
    format: 'Documentation',
    estimatedMinutes: 150,
    verified: true,
  },
  {
    id: 'res-owl-writing',
    skillId: 'critical-writing',
    title: 'Purdue OWL Academic & Analytical Writing',
    provider: 'Purdue OWL',
    url: 'https://owl.purdue.edu/owl/general_writing/academic_writing/index.html',
    format: 'Guide',
    estimatedMinutes: 120,
    verified: true,
  },
  {
    id: 'res-openstax-mgmt',
    skillId: 'strategic-management',
    title: 'OpenStax Principles of Management',
    provider: 'OpenStax',
    url: 'https://openstax.org/details/books/principles-management',
    format: 'Documentation',
    estimatedMinutes: 150,
    verified: true,
  },
  {
    id: 'res-openstax-biz',
    skillId: 'marketing-operations',
    title: 'OpenStax Organizational Behavior & Strategy',
    provider: 'OpenStax',
    url: 'https://openstax.org/details/books/organizational-behavior',
    format: 'Documentation',
    estimatedMinutes: 140,
    verified: true,
  },
  {
    id: 'res-cornell-law',
    skillId: 'constitutional-law',
    title: 'Cornell LII Constitutional & Statutory Reference',
    provider: 'Legal Information Institute',
    url: 'https://www.law.cornell.edu/wex',
    format: 'Documentation',
    estimatedMinutes: 150,
    verified: true,
  },
  {
    id: 'res-law-contracts',
    skillId: 'contracts-reasoning',
    title: 'Cornell Wex Contracts & Legal Reasoning Guide',
    provider: 'Legal Information Institute',
    url: 'https://www.law.cornell.edu/wex/contract',
    format: 'Guide',
    estimatedMinutes: 140,
    verified: true,
  },
  {
    id: 'res-mit-math',
    skillId: 'engineering-math',
    title: 'MIT OpenCourseWare Calculus & Linear Algebra',
    provider: 'MIT OCW',
    url: 'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/',
    format: 'Tutorial',
    estimatedMinutes: 180,
    verified: true,
  },
  {
    id: 'res-khan-logic',
    skillId: 'critical-reasoning',
    title: 'Khan Academy Logic, Quantitative & Study Mastery',
    provider: 'Khan Academy',
    url: 'https://www.khanacademy.org/',
    format: 'Interactive',
    estimatedMinutes: 120,
    verified: true,
  },
];

export const DOMAIN_CAREERS: CareerProfile[] = [
  {
    id: 'embedded-systems-engineer',
    title: 'Embedded & Systems Engineer',
    category: 'Engineering',
    domainId: 'engineering',
    summary: 'Design hardware-software interfaces, signals, control logic, and reliable C/Python firmware.',
    demandLabel: '5 Skills · Core Engineering',
    isPrimaryMvp: false,
    thumbnailKey: 'aiml',
    projectExpectations: ['Microcontroller telemetry or control-loop simulation report'],
    requirements: [
      { skillId: 'engineering-math', skillName: 'Engineering Mathematics', category: 'Engineering Systems', requiredProficiency: 4, weight: 1.5, isRequired: true, prerequisites: [], practicalExpectation: 'Differential equations, transforms, and linear systems.' },
      { skillId: 'python', skillName: 'Python & Scripting', category: 'Language', requiredProficiency: 3, weight: 1.3, isRequired: true, prerequisites: [], practicalExpectation: 'Sensor telemetry parsing and automation scripts.' },
      { skillId: 'critical-reasoning', skillName: 'Digital Logic & Circuits', category: 'Engineering Systems', requiredProficiency: 4, weight: 1.6, isRequired: true, prerequisites: ['engineering-math'], practicalExpectation: 'Boolean timing, state machines, and circuit analysis.' },
      { skillId: 'git', skillName: 'Git & Version Control', category: 'DevOps & Tools', requiredProficiency: 3, weight: 0.9, isRequired: false, prerequisites: [], practicalExpectation: 'Firmware release branching.' },
    ],
  },
  {
    id: 'core-engineering-analyst',
    title: 'Core Engineering & Design Analyst',
    category: 'Engineering',
    domainId: 'engineering',
    summary: 'Apply mechanics, thermodynamics, quantitative modeling, and structured engineering validation.',
    demandLabel: '4 Skills · Core Engineering',
    isPrimaryMvp: false,
    thumbnailKey: 'data',
    projectExpectations: ['Structural or thermodynamic system analysis report'],
    requirements: [
      { skillId: 'engineering-math', skillName: 'Engineering Mathematics', category: 'Engineering Systems', requiredProficiency: 4, weight: 1.6, isRequired: true, prerequisites: [], practicalExpectation: 'Vector calculus, matrices, and numerical methods.' },
      { skillId: 'statistics', skillName: 'Probability & Quality Statistics', category: 'Data & AI', requiredProficiency: 3, weight: 1.3, isRequired: true, prerequisites: [], practicalExpectation: 'Tolerance intervals and reliability analysis.' },
      { skillId: 'critical-reasoning', skillName: 'Applied Mechanics & Systems', category: 'Engineering Systems', requiredProficiency: 4, weight: 1.6, isRequired: true, prerequisites: ['engineering-math'], practicalExpectation: 'Force equilibrium, energy conservation, and failure modes.' },
      { skillId: 'python', skillName: 'Computational Scripting', category: 'Language', requiredProficiency: 3, weight: 1.1, isRequired: false, prerequisites: [], practicalExpectation: 'Parametric calculation notebooks.' },
    ],
  },
  {
    id: 'clinical-healthcare-track',
    title: 'Clinical & Healthcare Foundations',
    category: 'Medical',
    domainId: 'medical',
    summary: 'Build rigorous command of human anatomy, physiology, pharmacology principles, and structured clinical reasoning.',
    demandLabel: '4 Modules · Medical & Health',
    isPrimaryMvp: false,
    thumbnailKey: 'data',
    projectExpectations: ['Structured differential diagnosis & physiological case write-up'],
    requirements: [
      { skillId: 'clinical-anatomy', skillName: 'Human Anatomy & Physiology', category: 'Clinical & Bio', requiredProficiency: 4, weight: 1.7, isRequired: true, prerequisites: [], practicalExpectation: 'Organ systems, hemodynamics, and neuro-muscular pathways.' },
      { skillId: 'biochemistry-pharma', skillName: 'Biochemistry & Pharmacology', category: 'Clinical & Bio', requiredProficiency: 4, weight: 1.5, isRequired: true, prerequisites: ['clinical-anatomy'], practicalExpectation: 'Metabolic regulation, enzyme kinetics, and drug mechanisms.' },
      { skillId: 'clinical-reasoning', skillName: 'Clinical Case Reasoning', category: 'Clinical & Bio', requiredProficiency: 4, weight: 1.6, isRequired: true, prerequisites: ['clinical-anatomy', 'biochemistry-pharma'], practicalExpectation: 'Symptom synthesis, red-flag triage, and patient-safety protocols.' },
      { skillId: 'statistics', skillName: 'Biostatistics & Evidence Review', category: 'Data & AI', requiredProficiency: 3, weight: 1.0, isRequired: false, prerequisites: [], practicalExpectation: 'Interpreting clinical trial sensitivity, specificity, and risk ratios.' },
    ],
  },
  {
    id: 'pharma-health-track',
    title: 'Pharmaceutical & Diagnostic Sciences',
    category: 'Medical',
    domainId: 'medical',
    summary: 'Master pharmacokinetics, biochemical assays, quality assurance, and evidence-based patient safety.',
    demandLabel: '4 Modules · Healthcare',
    isPrimaryMvp: false,
    thumbnailKey: 'data',
    projectExpectations: ['Pharmacokinetic dosing & interaction review memo'],
    requirements: [
      { skillId: 'biochemistry-pharma', skillName: 'Pharmacology & Biochemistry', category: 'Clinical & Bio', requiredProficiency: 4, weight: 1.8, isRequired: true, prerequisites: [], practicalExpectation: 'Absorption, distribution, metabolism, excretion, and receptor binding.' },
      { skillId: 'clinical-anatomy', skillName: 'Human Physiology', category: 'Clinical & Bio', requiredProficiency: 3, weight: 1.4, isRequired: true, prerequisites: [], practicalExpectation: 'Renal, hepatic, and cardiovascular clearance mechanisms.' },
      { skillId: 'clinical-reasoning', skillName: 'Clinical Dosing & Lab QA', category: 'Clinical & Bio', requiredProficiency: 4, weight: 1.5, isRequired: true, prerequisites: ['biochemistry-pharma'], practicalExpectation: 'Therapeutic window validation and interaction checks.' },
      { skillId: 'statistics', skillName: 'Quantitative Lab Statistics', category: 'Data & AI', requiredProficiency: 3, weight: 1.0, isRequired: false, prerequisites: [], practicalExpectation: 'Assay calibration and error bounds.' },
    ],
  },
  {
    id: 'financial-analytics-track',
    title: 'Commerce, Accounting & Finance',
    category: 'Commerce',
    domainId: 'commerce',
    summary: 'Develop mastery over financial statements, valuation, corporate finance, taxation, and quantitative decision-making.',
    demandLabel: '4 Modules · Commerce & Finance',
    isPrimaryMvp: false,
    thumbnailKey: 'data',
    projectExpectations: ['Three-statement financial ratio & cash-flow case evaluation'],
    requirements: [
      { skillId: 'financial-accounting', skillName: 'Financial Accounting & Statements', category: 'Finance & Quant', requiredProficiency: 4, weight: 1.7, isRequired: true, prerequisites: [], practicalExpectation: 'Balance sheet, P&L, cash flow reconciliation, and accrual rules.' },
      { skillId: 'corporate-finance', skillName: 'Corporate Finance & Valuation', category: 'Finance & Quant', requiredProficiency: 4, weight: 1.6, isRequired: true, prerequisites: ['financial-accounting'], practicalExpectation: 'NPV, IRR, WACC, and working capital discipline.' },
      { skillId: 'economics-analysis', skillName: 'Micro & Macroeconomic Analysis', category: 'Finance & Quant', requiredProficiency: 3, weight: 1.3, isRequired: true, prerequisites: [], practicalExpectation: 'Elasticity, monetary policy, and interest-rate transmission.' },
      { skillId: 'statistics', skillName: 'Quantitative & Financial Math', category: 'Data & AI', requiredProficiency: 3, weight: 1.2, isRequired: true, prerequisites: [], practicalExpectation: 'Compounding, variance, and break-even modeling.' },
    ],
  },
  {
    id: 'humanities-research-track',
    title: 'Humanities, Social Science & Policy',
    category: 'Arts',
    domainId: 'arts',
    summary: 'Strengthen critical reading, empirical research design, economic/social theory, and persuasive academic writing.',
    demandLabel: '4 Modules · Arts & Humanities',
    isPrimaryMvp: false,
    thumbnailKey: 'fullstack',
    projectExpectations: ['Evidence-backed policy or literary research synthesis'],
    requirements: [
      { skillId: 'critical-writing', skillName: 'Academic & Analytical Writing', category: 'Humanities & Social', requiredProficiency: 4, weight: 1.6, isRequired: true, prerequisites: [], practicalExpectation: 'Thesis precision, source synthesis, and structured argumentation.' },
      { skillId: 'research-methods', skillName: 'Social & Qualitative Research', category: 'Humanities & Social', requiredProficiency: 4, weight: 1.5, isRequired: true, prerequisites: [], practicalExpectation: 'Experimental controls, sampling bias, and primary-source critique.' },
      { skillId: 'economics-analysis', skillName: 'Socio-Economic & Policy Context', category: 'Humanities & Social', requiredProficiency: 3, weight: 1.3, isRequired: true, prerequisites: [], practicalExpectation: 'Institutional incentives and historical causal analysis.' },
      { skillId: 'critical-reasoning', skillName: 'Formal Logic & Argumentation', category: 'Humanities & Social', requiredProficiency: 4, weight: 1.4, isRequired: true, prerequisites: [], practicalExpectation: 'Identifying logical fallacies and evaluating counterarguments.' },
    ],
  },
  {
    id: 'business-management-track',
    title: 'Business Strategy & Management',
    category: 'Management',
    domainId: 'management',
    summary: 'Master competitive strategy, marketing metrics, organizational leadership, and data-backed operational decisions.',
    demandLabel: '4 Modules · Management',
    isPrimaryMvp: false,
    thumbnailKey: 'data',
    projectExpectations: ['Market-entry strategy & unit economics case memo'],
    requirements: [
      { skillId: 'strategic-management', skillName: 'Competitive Strategy & Operations', category: 'Management & Strategy', requiredProficiency: 4, weight: 1.7, isRequired: true, prerequisites: [], practicalExpectation: 'Five-forces positioning, bottleneck throughput, and KPI trees.' },
      { skillId: 'marketing-operations', skillName: 'Marketing & Organizational Leadership', category: 'Management & Strategy', requiredProficiency: 4, weight: 1.5, isRequired: true, prerequisites: [], practicalExpectation: 'CAC/LTV economics, positioning, and team alignment.' },
      { skillId: 'financial-accounting', skillName: 'Managerial Finance Literacy', category: 'Finance & Quant', requiredProficiency: 3, weight: 1.3, isRequired: true, prerequisites: [], practicalExpectation: 'Contribution margins, budgeting, and ROI appraisal.' },
      { skillId: 'critical-reasoning', skillName: 'Executive Decision Analysis', category: 'Management & Strategy', requiredProficiency: 3, weight: 1.2, isRequired: false, prerequisites: ['strategic-management'], practicalExpectation: 'Trade-off matrices and risk mitigation.' },
    ],
  },
  {
    id: 'legal-studies-track',
    title: 'Legal Reasoning & Jurisprudence',
    category: 'Law',
    domainId: 'law',
    summary: 'Sharpen IRAC legal analysis, constitutional principles, contract & criminal liability, and statutory interpretation.',
    demandLabel: '4 Modules · Law',
    isPrimaryMvp: false,
    thumbnailKey: 'fullstack',
    projectExpectations: ['IRAC appellate case brief & statutory interpretation memo'],
    requirements: [
      { skillId: 'constitutional-law', skillName: 'Constitutional & Public Law', category: 'Legal & Policy', requiredProficiency: 4, weight: 1.6, isRequired: true, prerequisites: [], practicalExpectation: 'Separation of powers, fundamental rights, and judicial review.' },
      { skillId: 'contracts-reasoning', skillName: 'Contracts, Torts & Liability', category: 'Legal & Policy', requiredProficiency: 4, weight: 1.7, isRequired: true, prerequisites: [], practicalExpectation: 'Offer/acceptance, consideration, breach remedies, and duty of care.' },
      { skillId: 'critical-reasoning', skillName: 'IRAC Legal Reasoning & Logic', category: 'Legal & Policy', requiredProficiency: 4, weight: 1.6, isRequired: true, prerequisites: ['constitutional-law'], practicalExpectation: 'Applying precedent and statutory text to novel fact patterns.' },
      { skillId: 'critical-writing', skillName: 'Legal Research & Advocacy Writing', category: 'Humanities & Social', requiredProficiency: 3, weight: 1.2, isRequired: false, prerequisites: [], practicalExpectation: 'Concise issue framing and persuasive counter-analysis.' },
    ],
  },
  {
    id: 'interdisciplinary-foundations-track',
    title: 'Interdisciplinary Career Foundations',
    category: 'General',
    domainId: 'other',
    summary: 'Build transferable analytical reasoning, quantitative fluency, structured communication, and self-directed mastery.',
    demandLabel: '4 Modules · Interdisciplinary',
    isPrimaryMvp: false,
    thumbnailKey: 'fullstack',
    projectExpectations: ['Cross-disciplinary problem analysis & learning portfolio'],
    requirements: [
      { skillId: 'critical-reasoning', skillName: 'Critical & Logical Reasoning', category: 'Foundations', requiredProficiency: 4, weight: 1.6, isRequired: true, prerequisites: [], practicalExpectation: 'Deductive reasoning, causal evaluation, and structured synthesis.' },
      { skillId: 'statistics', skillName: 'Quantitative & Data Literacy', category: 'Data & AI', requiredProficiency: 3, weight: 1.4, isRequired: true, prerequisites: [], practicalExpectation: 'Interpreting ratios, charts, variance, and probability.' },
      { skillId: 'critical-writing', skillName: 'Structured Communication', category: 'Humanities & Social', requiredProficiency: 4, weight: 1.4, isRequired: true, prerequisites: [], practicalExpectation: 'Clear executive summaries and evidence-backed memos.' },
      { skillId: 'research-methods', skillName: 'Applied Research & Synthesis', category: 'Foundations', requiredProficiency: 3, weight: 1.2, isRequired: false, prerequisites: ['critical-reasoning'], practicalExpectation: 'Evaluating primary sources and designing study milestones.' },
    ],
  },
];

export function getDomainMeta(domainId: string | undefined): AcademicDomainMeta {
  return ACADEMIC_DOMAINS.find((d) => d.id === domainId) ?? ACADEMIC_DOMAINS[0];
}

export function getCourseMeta(domainId: string | undefined, courseId: string | undefined): CourseOption {
  const domain = getDomainMeta(domainId);
  return domain.courses.find((c) => c.id === courseId) ?? domain.courses[0];
}
