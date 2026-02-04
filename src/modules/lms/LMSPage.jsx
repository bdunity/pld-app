import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../core/config/firebase';
import {
  GraduationCap,
  BookOpen,
  Clock,
  CheckCircle,
  Play,
  Award,
  Loader2,
  ChevronRight,
  FileText,
  Video,
} from 'lucide-react';

export function LMSPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState(null);

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    setLoading(true);
    try {
      const getAvailableCourses = httpsCallable(functions, 'getAvailableCourses');
      const result = await getAvailableCourses();
      setCourses(result.data.courses || []);
    } catch (error) {
      console.error('Error loading courses:', error);
    } finally {
      setLoading(false);
    }
  };

  const getProgressPercentage = (progress, moduleCount) => {
    if (!progress?.completedModules?.length) return 0;
    return Math.round((progress.completedModules.length / moduleCount) * 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (selectedCourse) {
    return (
      <CoursePlayer
        courseId={selectedCourse}
        onBack={() => {
          setSelectedCourse(null);
          loadCourses();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-secondary-900 flex items-center gap-2">
          <GraduationCap className="w-7 h-7 text-primary-600" />
          Capacitación PLD
        </h1>
        <p className="text-secondary-600 mt-1">
          Cursos de cumplimiento con certificación automática
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-secondary-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">{courses.length}</p>
              <p className="text-sm text-secondary-500">Cursos disponibles</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-secondary-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">
                {courses.filter((c) => c.progress?.examPassed).length}
              </p>
              <p className="text-sm text-secondary-500">Cursos completados</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-secondary-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
              <Award className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">
                {courses.filter((c) => c.progress?.certificateUrl).length}
              </p>
              <p className="text-sm text-secondary-500">Certificados obtenidos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Courses Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {courses.map((course) => {
          const progress = getProgressPercentage(course.progress, course.moduleCount);
          const isCompleted = course.progress?.examPassed;

          return (
            <div
              key={course.id}
              className="bg-white rounded-xl border border-secondary-200 overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Course Header */}
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 bg-primary-100 rounded-lg flex items-center justify-center">
                    <GraduationCap className="w-7 h-7 text-primary-600" />
                  </div>
                  {isCompleted && (
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Completado
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-semibold text-secondary-900 mb-2">
                  {course.title}
                </h3>
                <p className="text-sm text-secondary-600 mb-4">{course.description}</p>

                <div className="flex items-center gap-4 text-sm text-secondary-500">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {course.duration}
                  </div>
                  <div className="flex items-center gap-1">
                    <BookOpen className="w-4 h-4" />
                    {course.moduleCount} módulos
                  </div>
                </div>
              </div>

              {/* Progress */}
              <div className="px-6 pb-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-secondary-600">Progreso</span>
                  <span className="font-medium text-secondary-900">{progress}%</span>
                </div>
                <div className="w-full h-2 bg-secondary-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isCompleted ? 'bg-green-500' : 'bg-primary-500'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={() => setSelectedCourse(course.id)}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {isCompleted ? (
                    <>
                      <Play className="w-4 h-4" />
                      Revisar curso
                    </>
                  ) : progress > 0 ? (
                    <>
                      <Play className="w-4 h-4" />
                      Continuar
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Comenzar
                    </>
                  )}
                </button>

                {course.progress?.certificateUrl && (
                  <a
                    href={course.progress.certificateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Award className="w-4 h-4" />
                    Certificado
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {courses.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-secondary-200">
          <GraduationCap className="w-12 h-12 text-secondary-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-secondary-900 mb-2">
            No hay cursos disponibles
          </h3>
          <p className="text-secondary-600">
            Los cursos de capacitación se cargarán pronto.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// COURSE PLAYER COMPONENT
// ============================================================

function CoursePlayer({ courseId, onBack }) {
  const [course, setCourse] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState(null);
  const [showExam, setShowExam] = useState(false);
  const [examAnswers, setExamAnswers] = useState({});
  const [examResult, setExamResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    loadCourse();
  }, [courseId]);

  const loadCourse = async () => {
    setLoading(true);
    try {
      const getCourseDetail = httpsCallable(functions, 'getCourseDetail');
      const result = await getCourseDetail({ courseId });
      setCourse(result.data.course);
      setProgress(result.data.progress);

      // Si hay módulos, seleccionar el primero no completado
      if (result.data.course.modules?.length > 0) {
        const completedModules = result.data.progress?.completedModules || [];
        const firstIncomplete = result.data.course.modules.find(
          (m) => !completedModules.includes(m.id)
        );
        setActiveModule(firstIncomplete || result.data.course.modules[0]);
      }
    } catch (error) {
      console.error('Error loading course:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteModule = async (moduleId) => {
    try {
      const completeModule = httpsCallable(functions, 'completeModule');
      await completeModule({ courseId, moduleId });

      // Actualizar progreso local
      setProgress((prev) => ({
        ...prev,
        completedModules: [...(prev?.completedModules || []), moduleId],
      }));

      // Avanzar al siguiente módulo
      const currentIndex = course.modules.findIndex((m) => m.id === moduleId);
      if (currentIndex < course.modules.length - 1) {
        setActiveModule(course.modules[currentIndex + 1]);
      }
    } catch (error) {
      console.error('Error completing module:', error);
    }
  };

  const handleSubmitExam = async () => {
    setSubmitting(true);
    try {
      const submitExam = httpsCallable(functions, 'submitExam');
      const result = await submitExam({ courseId, answers: examAnswers });
      setExamResult(result.data);

      if (result.data.passed) {
        setShowConfetti(true);
        setProgress((prev) => ({
          ...prev,
          examPassed: true,
          certificateUrl: result.data.certificateUrl,
        }));
      }
    } catch (error) {
      console.error('Error submitting exam:', error);
      alert('Error al enviar el examen');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="text-center py-12">
        <p className="text-secondary-600">Curso no encontrado</p>
        <button onClick={onBack} className="btn-primary mt-4">
          Volver
        </button>
      </div>
    );
  }

  // Exam View
  if (showExam) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setShowExam(false)}
          className="text-secondary-600 hover:text-secondary-900 flex items-center gap-1"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Volver al curso
        </button>

        {examResult ? (
          // Result View
          <div className="bg-white rounded-xl border border-secondary-200 p-8 text-center">
            {showConfetti && (
              <div className="text-6xl mb-4 animate-bounce">🎉</div>
            )}

            <div
              className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-4 ${
                examResult.passed ? 'bg-green-100' : 'bg-red-100'
              }`}
            >
              {examResult.passed ? (
                <CheckCircle className="w-12 h-12 text-green-600" />
              ) : (
                <span className="text-3xl font-bold text-red-600">
                  {examResult.score}%
                </span>
              )}
            </div>

            <h2 className="text-2xl font-bold text-secondary-900 mb-2">
              {examResult.passed ? '¡Felicidades!' : 'Sigue practicando'}
            </h2>

            <p className="text-secondary-600 mb-6">{examResult.message}</p>

            <div className="flex items-center justify-center gap-4 text-sm text-secondary-500 mb-6">
              <span>Puntaje: {examResult.score}%</span>
              <span>•</span>
              <span>
                {examResult.correctCount}/{examResult.totalQuestions} correctas
              </span>
              <span>•</span>
              <span>Mínimo: {examResult.passingScore}%</span>
            </div>

            {examResult.passed && examResult.certificateUrl && (
              <a
                href={examResult.certificateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-flex items-center gap-2 mb-4"
              >
                <Award className="w-5 h-5" />
                Descargar Certificado
              </a>
            )}

            <div className="flex justify-center gap-3">
              {!examResult.passed && (
                <button
                  onClick={() => {
                    setExamResult(null);
                    setExamAnswers({});
                  }}
                  className="btn-primary"
                >
                  Intentar de nuevo
                </button>
              )}
              <button onClick={onBack} className="btn-secondary">
                Volver a cursos
              </button>
            </div>
          </div>
        ) : (
          // Exam Form
          <div className="bg-white rounded-xl border border-secondary-200 p-6">
            <h2 className="text-xl font-bold text-secondary-900 mb-2">
              Examen: {course.title}
            </h2>
            <p className="text-secondary-600 mb-6">
              Puntaje mínimo para aprobar: {course.exam.passingScore}%
            </p>

            <div className="space-y-6">
              {course.exam.questions.map((question, qIdx) => (
                <div key={question.id} className="border-b pb-6 last:border-0">
                  <p className="font-medium text-secondary-900 mb-3">
                    {qIdx + 1}. {question.question}
                  </p>
                  <div className="space-y-2">
                    {question.options.map((option, oIdx) => (
                      <label
                        key={oIdx}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          examAnswers[question.id] === oIdx
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-secondary-200 hover:bg-secondary-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={question.id}
                          checked={examAnswers[question.id] === oIdx}
                          onChange={() =>
                            setExamAnswers({ ...examAnswers, [question.id]: oIdx })
                          }
                          className="text-primary-600"
                        />
                        <span className="text-secondary-700">{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowExam(false)} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={handleSubmitExam}
                disabled={
                  submitting ||
                  Object.keys(examAnswers).length < course.exam.questions.length
                }
                className="btn-primary flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Evaluando...
                  </>
                ) : (
                  'Enviar examen'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Course Content View
  const completedModules = progress?.completedModules || [];
  const allModulesCompleted = course.modules.every((m) =>
    completedModules.includes(m.id)
  );

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="text-secondary-600 hover:text-secondary-900 flex items-center gap-1"
      >
        <ChevronRight className="w-4 h-4 rotate-180" />
        Volver a cursos
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Module List (Sidebar) */}
        <div className="bg-white rounded-xl border border-secondary-200 p-4 lg:col-span-1">
          <h3 className="font-semibold text-secondary-900 mb-4">Contenido del curso</h3>
          <div className="space-y-2">
            {course.modules.map((module, idx) => {
              const isCompleted = completedModules.includes(module.id);
              const isActive = activeModule?.id === module.id;

              return (
                <button
                  key={module.id}
                  onClick={() => setActiveModule(module)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                    isActive
                      ? 'bg-primary-50 border border-primary-200'
                      : 'hover:bg-secondary-50'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isCompleted
                        ? 'bg-green-100 text-green-600'
                        : isActive
                        ? 'bg-primary-100 text-primary-600'
                        : 'bg-secondary-100 text-secondary-500'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <span className="text-sm font-medium">{idx + 1}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${
                        isActive ? 'text-primary-700' : 'text-secondary-900'
                      }`}
                    >
                      {module.title}
                    </p>
                    <p className="text-xs text-secondary-500 flex items-center gap-1">
                      {module.type === 'video' ? (
                        <Video className="w-3 h-3" />
                      ) : (
                        <FileText className="w-3 h-3" />
                      )}
                      {module.duration}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Exam Button */}
          <div className="mt-4 pt-4 border-t">
            <button
              onClick={() => setShowExam(true)}
              disabled={!allModulesCompleted && !progress?.examPassed}
              className={`w-full flex items-center justify-center gap-2 p-3 rounded-lg font-medium ${
                progress?.examPassed
                  ? 'bg-green-100 text-green-700'
                  : allModulesCompleted
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'bg-secondary-100 text-secondary-400 cursor-not-allowed'
              }`}
            >
              <Award className="w-5 h-5" />
              {progress?.examPassed
                ? 'Examen aprobado ✓'
                : allModulesCompleted
                ? 'Tomar examen'
                : 'Completa todos los módulos'}
            </button>
          </div>
        </div>

        {/* Module Content */}
        <div className="bg-white rounded-xl border border-secondary-200 p-6 lg:col-span-2">
          {activeModule ? (
            <>
              <h2 className="text-xl font-bold text-secondary-900 mb-4">
                {activeModule.title}
              </h2>

              {activeModule.type === 'video' ? (
                <div className="aspect-video bg-black rounded-lg overflow-hidden mb-6">
                  <iframe
                    src={activeModule.videoUrl}
                    title={activeModule.title}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="prose prose-sm max-w-none mb-6 bg-secondary-50 p-4 rounded-lg">
                  <pre className="whitespace-pre-wrap font-sans text-secondary-700">
                    {activeModule.content}
                  </pre>
                </div>
              )}

              <div className="flex justify-between items-center pt-4 border-t">
                <span className="text-sm text-secondary-500">
                  Duración: {activeModule.duration}
                </span>

                {!completedModules.includes(activeModule.id) ? (
                  <button
                    onClick={() => handleCompleteModule(activeModule.id)}
                    className="btn-primary flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Marcar como completado
                  </button>
                ) : (
                  <span className="text-green-600 flex items-center gap-1 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    Completado
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <BookOpen className="w-12 h-12 text-secondary-300 mx-auto mb-4" />
              <p className="text-secondary-600">
                Selecciona un módulo para comenzar
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LMSPage;
