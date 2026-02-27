import { useState, useEffect, useCallback, useMemo } from 'react'
import './App.css'

const QUESTION_TYPES = [
  { id: 'enToZh', name: '英文选中文', desc: '看到英文，选出正确中文' },
  { id: 'zhToEn', name: '中文选英文', desc: '看到中文，选出正确英文' },
  { id: 'spell', name: 'Spell it', desc: '根据中文拼出英文' },
]

const MASTERY_STORAGE_KEY = 'wordMonsterMastery'
const WRONG_COUNTS_STORAGE_KEY = 'wordMonsterWrongCounts' // 错题次数，不随重置清除

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickOptions(correct, pool, count = 4) {
  const others = pool.filter((w) => w.en !== correct.en && w.zh !== correct.zh)
  const shuffled = shuffle(others).slice(0, count - 1)
  return shuffle([correct, ...shuffled])
}

export default function App() {
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [screen, setScreen] = useState('home') // 'home' | 'game' | 'result'
  const [mode, setMode] = useState('normal') // 'normal' | 'review' | 'wrong' 错题模式
  const [mastery, setMastery] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem(MASTERY_STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [wrongCounts, setWrongCounts] = useState(() => {
    if (typeof window === 'undefined') return {}
    try {
      const raw = window.localStorage.getItem(WRONG_COUNTS_STORAGE_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })
  const [showWrongPanel, setShowWrongPanel] = useState(false)
  const [gameState, setGameState] = useState({
    currentIndex: 0,
    hp: 3,
    score: 0,
    questionType: 'enToZh',
    options: [],
    spellInput: '',
    feedback: null, // 'correct' | 'wrong' | 'hint'
    hint: null,
    wrongAttempts: 0,
    pool: [],
    gameOver: false,
  })

  useEffect(() => {
    fetch('/words.json')
      .then((r) => r.json())
      .then((data) => {
        setWords(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(MASTERY_STORAGE_KEY, JSON.stringify(mastery))
    } catch {
      // ignore
    }
  }, [mastery])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(WRONG_COUNTS_STORAGE_KEY, JSON.stringify(wrongCounts))
    } catch {
      // ignore
    }
  }, [wrongCounts])

  const masterySet = useMemo(() => new Set(mastery), [mastery])

  const unpassedCount = useMemo(
    () => words.filter((w) => !masterySet.has(w.en.toLowerCase())).length,
    [words, masterySet],
  )
  const passedCount = useMemo(
    () => words.filter((w) => masterySet.has(w.en.toLowerCase())).length,
    [words, masterySet],
  )
  const wrongWordsCount = useMemo(
    () => words.filter((w) => (wrongCounts[w.en.toLowerCase()] || 0) >= 1).length,
    [words, wrongCounts],
  )
  const wrongList = useMemo(
    () =>
      words
        .map((w) => {
          const key = w.en.toLowerCase()
          return { ...w, key, count: wrongCounts[key] || 0 }
        })
        .filter((w) => w.count >= 1)
        .sort((a, b) => b.count - a.count),
    [words, wrongCounts],
  )

  const currentWord =
    gameState.pool && gameState.pool.length > 0
      ? gameState.pool[gameState.currentIndex]
      : null
  const totalInRun = gameState.pool.length

  const buildPool = useCallback(
    (selectedMode) => {
      if (!words.length) return []
      const pool = words.filter((w) => {
        const key = w.en.toLowerCase()
        if (selectedMode === 'wrong') return (wrongCounts[key] || 0) >= 1
        if (selectedMode === 'normal') return !masterySet.has(key)
        if (selectedMode === 'review') return masterySet.has(key)
        return false
      })
      return shuffle(pool)
    },
    [words, masterySet, wrongCounts],
  )

  const resetMastery = () => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm('确定要重置所有通关进度吗？（错题记录会保留）')
      if (!ok) return
    }
    setMastery([])
  }

  const startGame = useCallback(
    (selectedMode) => {
      if (words.length < 4) return
      const modeToUse = selectedMode || mode
      const pool = buildPool(modeToUse)
      if (!pool.length) {
        // 当前模式下没有可用单词
        return
      }
      const type =
        QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)].id
      const first = pool[0]
      const options = type === 'spell' ? [] : pickOptions(first, pool)
      setMode(modeToUse)
      setGameState({
        currentIndex: 0,
        hp: 3,
        score: 0,
        questionType: type,
        options,
        spellInput: '',
        feedback: null,
        hint: null,
        wrongAttempts: 0,
        pool,
      })
      setScreen('game')
    },
    [words.length, mode, buildPool],
  )

  const markMastered = useCallback((word) => {
    const key = word.en.toLowerCase()
    setMastery((prev) => (prev.includes(key) ? prev : [...prev, key]))
  }, [])

  const incrementWrongCount = useCallback((word) => {
    const key = word.en.toLowerCase()
    setWrongCounts((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }))
  }, [])

  const goNext = useCallback(() => {
    setGameState((prev) => {
      const pool = prev.pool || []
      const nextIndex = prev.currentIndex + 1
      if (nextIndex >= pool.length) {
        setScreen('result')
        return prev
      }
      const type =
        QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)].id
      const nextWord = pool[nextIndex]
      const options = type === 'spell' ? [] : pickOptions(nextWord, pool)
      return {
        ...prev,
        currentIndex: nextIndex,
        questionType: type,
        options,
        spellInput: '',
        feedback: null,
        hint: null,
        wrongAttempts: 0,
        gameOver: false,
      }
    })
  }, [])

  const checkChoice = (chosen) => {
    if (!currentWord || gameState.feedback && gameState.feedback !== 'hint')
      return
    const isCorrect =
      gameState.questionType === 'enToZh'
        ? currentWord.zh === chosen
        : currentWord.en === chosen

    if (isCorrect) {
      markMastered(currentWord)
      setGameState((s) => ({
        ...s,
        feedback: 'correct',
        hint: null,
        score: s.score + 1,
      }))
      return
    }

    // 第一次答错：只给提示，不扣血，错题记录 +1
    if (gameState.wrongAttempts === 0) {
      incrementWrongCount(currentWord)
      let hint = ''
      if (gameState.questionType === 'spell' || gameState.questionType === 'zhToEn') {
        hint = `提示：首字母 ${currentWord.en[0].toUpperCase()}，共 ${
          currentWord.en.length
        } 个字母`
      } else {
        hint = '提示：再想一想，可以先排除明显不相关的选项'
      }
      setGameState((s) => ({
        ...s,
        feedback: 'hint',
        hint,
        wrongAttempts: 1,
      }))
      return
    }

    // 第二次及之后答错：错题记录 +1，给出正确答案并扣一颗心
    incrementWrongCount(currentWord)
    const newHp = gameState.hp - 1
    setGameState((s) => ({
      ...s,
      feedback: 'wrong',
      hint: null,
      wrongAttempts: 2,
      hp: newHp,
      gameOver: newHp <= 0,
    }))
  }

  const checkSpell = () => {
    if (!currentWord) return
    if (gameState.feedback && gameState.feedback !== 'hint') return
    if (!gameState.spellInput.trim()) return

    const raw = gameState.spellInput.trim().toLowerCase()
    const correctEn = currentWord.en.toLowerCase().trim()
    const isCorrect = raw === correctEn

    if (isCorrect) {
      markMastered(currentWord)
      setGameState((s) => ({
        ...s,
        feedback: 'correct',
        hint: null,
        score: s.score + 1,
      }))
      return
    }

    // 第一次错误：错题记录 +1，给出拼写提示
    if (gameState.wrongAttempts === 0) {
      incrementWrongCount(currentWord)
      const first = currentWord.en[0]
      const masked =
        first + ' ' + '_ '.repeat(Math.max(currentWord.en.length - 1, 0))
      setGameState((s) => ({
        ...s,
        feedback: 'hint',
        hint: `提示：${masked.trim()}`,
        wrongAttempts: 1,
        spellInput: '',
      }))
      return
    }

    // 第二次错误：错题记录 +1，显示正确答案并扣血
    incrementWrongCount(currentWord)
    const newHp = gameState.hp - 1
    setGameState((s) => ({
      ...s,
      feedback: 'wrong',
      hint: null,
      wrongAttempts: 2,
      hp: newHp,
      spellInput: '',
      gameOver: newHp <= 0,
    }))
  }

  if (loading) {
    return (
      <div className="screen loading">
        <p>正在加载词库…</p>
      </div>
    )
  }

  if (screen === 'home') {
    return (
      <div className="screen home">
        <div className="hero">
          <span className="girl-emoji">👧</span>
          <h1>雅思打怪兽背单词</h1>
          <p className="subtitle">每只怪兽都是一个单词，答对才能击败它！</p>
        </div>
        <div className="modes">
          <p className="mode-title">攻击模式</p>
          <ul>
            {QUESTION_TYPES.map((t) => (
              <li key={t.id}>
                <strong>{t.name}</strong>：{t.desc}
              </li>
            ))}
          </ul>
        </div>
        <p className="word-count">
          总词汇：{words.length} 个 · 已通关：{passedCount} 个 · 未通关：
          {unpassedCount} 个 · 错题：{wrongWordsCount} 个
        </p>
        <div className="home-actions">
          <button
            className="btn-start"
            onClick={() => startGame('normal')}
            disabled={unpassedCount < 4}
          >
            普通模式（只出未通关）
          </button>
          <button
            className="btn-secondary"
            onClick={() => startGame('review')}
            disabled={passedCount === 0}
          >
            复习模式（只出已通关）
          </button>
          <button
            className="btn-wrong"
            onClick={() => startGame('wrong')}
            disabled={wrongWordsCount < 1}
          >
            错题模式（只出错过的词）
          </button>
        </div>
        <button
          className="btn-reset"
          onClick={resetMastery}
        >
          重置所有通关进度
        </button>
        {wrongWordsCount > 0 && (
          <button
            className="btn-reset-inline"
            onClick={() => setShowWrongPanel(true)}
          >
            查看错题记录
          </button>
        )}
        {showWrongPanel && wrongList.length > 0 && (
          <div className="wrong-panel-overlay">
            <div className="wrong-panel">
              <h3>错题记录</h3>
              <p className="wrong-summary">
                共 {wrongList.length} 个单词出现错误（按错误次数排序）
              </p>
              <div className="wrong-list">
                {wrongList.slice(0, 80).map((w, idx) => (
                  <div key={w.key} className="wrong-item">
                    <span className="wrong-rank">{idx + 1}.</span>
                    <span className="wrong-word">{w.en}</span>
                    <span className="wrong-zh">{w.zh}</span>
                    <span className="wrong-count">错 {w.count} 次</span>
                  </div>
                ))}
              </div>
              <button
                className="btn-secondary"
                onClick={() => setShowWrongPanel(false)}
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (screen === 'result') {
    return (
      <div className="screen result">
        <h2>本局结束</h2>
        <p className="final-score">击败怪兽：{gameState.score} 只</p>
        <p className="word-count">
          已通关：{passedCount} / {words.length} 个
        </p>
        <button className="btn-start" onClick={() => startGame(mode)}>
          再玩一局（当前模式）
        </button>
        <button className="btn-secondary" onClick={() => setScreen('home')}>
          返回首页
        </button>
        <button className="btn-reset-inline" onClick={resetMastery}>
          重置所有通关进度
        </button>
      </div>
    )
  }

  if (!currentWord) {
    return (
      <div className="screen game">
        <p className="subtitle">
          当前模式下没有更多要打的单词了，可以返回首页或重置进度。
        </p>
        <button className="btn-secondary" onClick={() => setScreen('home')}>
          返回首页
        </button>
        <button className="btn-reset-inline" onClick={resetMastery}>
          重置所有通关进度
        </button>
      </div>
    )
  }

  const typeInfo = QUESTION_TYPES.find((t) => t.id === gameState.questionType)

  return (
    <div className="screen game">
      {showWrongPanel && wrongList.length > 0 && (
        <div className="wrong-panel-overlay">
          <div className="wrong-panel">
            <h3>错题记录</h3>
            <p className="wrong-summary">
              共 {wrongList.length} 个单词出现错误（按错误次数排序）
            </p>
            <div className="wrong-list">
              {wrongList.slice(0, 80).map((w, idx) => (
                <div key={w.key} className="wrong-item">
                  <span className="wrong-rank">{idx + 1}.</span>
                  <span className="wrong-word">{w.en}</span>
                  <span className="wrong-zh">{w.zh}</span>
                  <span className="wrong-count">错 {w.count} 次</span>
                </div>
              ))}
            </div>
            <button
              className="btn-secondary"
              onClick={() => setShowWrongPanel(false)}
            >
              关闭
            </button>
          </div>
        </div>
      )}
      <div className="game-hud">
        <div className="hp-bar">
          {[1, 2, 3].map((i) => (
            <span key={i} className={gameState.hp >= i ? 'heart' : 'heart lost'}>
              ❤️
            </span>
          ))}
        </div>
        <div className="score">击败：{gameState.score}</div>
        <div className="progress">
          {gameState.currentIndex + 1} / {totalInRun}
        </div>
        <div className="hud-actions">
          <button className="btn-reset-mini" onClick={resetMastery}>
            重置进度
          </button>
          {wrongWordsCount > 0 && (
            <button
              className="btn-wrong-mini"
              onClick={() => setShowWrongPanel(true)}
            >
              错题记录
            </button>
          )}
          <button
            className="btn-secondary-mini"
            onClick={() => setScreen('home')}
          >
            回首页
          </button>
        </div>
      </div>

      <div className="battle">
        <div className="character girl">
          <span className="sprite">👧</span>
          <span className="label">你</span>
        </div>
        <div className="monster">
          <span className="monster-emoji">👾</span>
          <span className="monster-word">
            {gameState.questionType === 'enToZh' ? currentWord.en : currentWord.zh}
          </span>
          <span className="monster-label">怪兽单词</span>
        </div>
      </div>

      <div className="question-panel">
        <p className="mode-badge">
          {typeInfo?.name} ·{' '}
          {mode === 'normal' ? '普通模式' : mode === 'wrong' ? '错题模式' : '复习模式'}
        </p>
        {gameState.questionType === 'spell' ? (
          <div className="spell-box">
            <p className="prompt">
              中文释义：<strong>{currentWord.zh}</strong>
            </p>
            <p className="spell-hint">请拼写英文单词</p>
            <input
              type="text"
              className="spell-input"
              value={gameState.spellInput}
              onChange={(e) =>
                setGameState((s) => ({ ...s, spellInput: e.target.value }))
              }
              onKeyDown={(e) => e.key === 'Enter' && checkSpell()}
              placeholder="输入英文..."
              autoFocus
            />
            <button className="btn-attack" onClick={checkSpell}>
              攻击（提交）
            </button>
          </div>
        ) : (
          <div className="choices">
            <p className="prompt">
              {gameState.questionType === 'enToZh'
                ? '选出正确的中文释义：'
                : '选出正确的英文单词：'}
            </p>
            <div className="options">
              {gameState.options.map((opt, i) => (
                <button
                  key={i}
                  className="option"
                  onClick={() =>
                    checkChoice(
                      gameState.questionType === 'enToZh' ? opt.zh : opt.en,
                    )
                  }
                  disabled={gameState.feedback && gameState.feedback !== 'hint'}
                >
                  {gameState.questionType === 'enToZh' ? opt.zh : opt.en}
                </button>
              ))}
            </div>
          </div>
        )}

        {(gameState.feedback === 'correct' || gameState.feedback === 'wrong') && (
          <div
            className={`answer-panel ${
              gameState.feedback === 'correct' ? 'correct' : 'wrong'
            }`}
          >
            <div className="answer-main">
              <div className="answer-title">
                {gameState.feedback === 'correct'
                  ? '✓ 答对了！'
                  : '✗ 答错了！'}
              </div>
              <div className="answer-text">
                {currentWord.en} — {currentWord.zh}
              </div>
              <div className="answer-sub">
                生命值：{gameState.hp} / 3
                {gameState.gameOver && ' · 本局生命已用完'}
              </div>
            </div>
            <div className="answer-actions">
              {!gameState.gameOver && (
                <button className="btn-attack" onClick={goNext}>
                  下一题
                </button>
              )}
              {gameState.gameOver && (
                <button
                  className="btn-start"
                  onClick={() => setScreen('result')}
                >
                  查看本局结果
                </button>
              )}
              <button
                className="btn-secondary-inline"
                onClick={() => setScreen('home')}
              >
                返回首页
              </button>
            </div>
          </div>
        )}
        {gameState.feedback === 'hint' && gameState.hint && (
          <div className="feedback hint">{gameState.hint}</div>
        )}
      </div>
    </div>
  )
}

