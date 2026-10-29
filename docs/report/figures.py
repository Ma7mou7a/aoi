"""Figures for the technical report, drawn from the validation study (docs/validation.md).

Run: python docs/report/figures.py  →  docs/report/figures/*.pdf
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

OUT = Path(__file__).parent / "figures"
OUT.mkdir(exist_ok=True)

# One palette for the whole report: blue/orange, safe for colour-vision deficiency, plus neutrals.
BLUE, ORANGE, GREY, INK, LIGHT = "#1f6fb2", "#e07b28", "#9aa5b1", "#1b2a3a", "#d7e3ef"
plt.rcParams.update({
    "font.family": "serif",
    "font.size": 9,
    "axes.titlesize": 9.5,
    "axes.labelsize": 9,
    "axes.edgecolor": "#5b6b7b",
    "axes.linewidth": 0.6,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "xtick.major.width": 0.6,
    "ytick.major.width": 0.6,
    "legend.frameon": False,
    "savefig.bbox": "tight",
    "savefig.pad_inches": 0.02,
})

SKILLS = ["Working\nmemory", "Attention &\ninhibition", "Processing\nspeed", "Cognitive\nflexibility", "Visuospatial\nmemory", "Reasoning", "AI\nreliance"]


def save(fig, name):
    fig.savefig(OUT / f"{name}.pdf")
    plt.close(fig)


# E1: band coverage before and after calibration, with the 90% target.
before = [66, 69, 52, 64, 82, 62, 94]
after = [91, 94, 92, 93, 89, 94, 95]
fig, ax = plt.subplots(figsize=(6.3, 2.4))
x = np.arange(len(SKILLS))
ax.bar(x - 0.19, before, 0.36, color=LIGHT, edgecolor=GREY, linewidth=0.5, label="Hand-set level ranges")
ax.bar(x + 0.19, after, 0.36, color=BLUE, label="Fitted calibration")
ax.axhline(90, color=ORANGE, linewidth=1, linestyle="--")
ax.text(-0.45, 91.2, "90% target", color=ORANGE, ha="left", fontsize=8)
ax.set_xticks(x, SKILLS, fontsize=7.5)
ax.set_ylim(40, 100)
ax.set_ylabel("90% band coverage (%)")
ax.legend(loc="lower center", bbox_to_anchor=(0.5, 1.0), ncol=2, fontsize=8)
save(fig, "coverage")

# E1: recovery r and mean absolute error per skill.
r = [0.841, 0.75, 0.935, 0.679, 0.921, 0.917, 0.366]
mae = [7.1, 9.1, 5.7, 10.0, 5.7, 6.0, 12.6]
fig, ax = plt.subplots(figsize=(3.1, 2.4))
ax.scatter(r, mae, s=36, color=BLUE, zorder=3)
labels = ["WM", "Att", "Speed", "Flex", "Visuo", "Reas", "AI rel."]
offsets = {"WM": (5, 3), "Att": (5, 3), "Speed": (6, -10), "Flex": (5, 3), "Visuo": (-30, -11), "Reas": (-26, 6), "AI rel.": (5, 3)}
for xi, yi, l in zip(r, mae, labels):
    ax.annotate(l, (xi, yi), textcoords="offset points", xytext=offsets[l], fontsize=7.5, color=INK)
ax.set_xlabel("Recovery of true ability (Pearson r)")
ax.set_ylabel("Mean abs. error (points)")
ax.set_xlim(0.3, 1.0)
ax.set_ylim(4, 14)
ax.grid(alpha=0.25, linewidth=0.5)
save(fig, "recovery")

# E2: adaptive vs random selection.
blocks = [3, 6, 9, 12, 18]
ad = [14, 13, 12, 11, 10.1]
rnd = [16, 14.5, 13, 13, 11.2]
fig, ax = plt.subplots(figsize=(3.1, 2.4))
ax.plot(blocks, rnd, "o--", color=GREY, linewidth=1.2, markersize=4, label="Random order")
ax.plot(blocks, ad, "o-", color=BLUE, linewidth=1.6, markersize=4, label="Adaptive selector")
ax.fill_between(blocks, ad, rnd, color=BLUE, alpha=0.08)
ax.set_xlabel("Games played")
ax.set_ylabel("RMSE over 7 skills (points)")
ax.set_xticks(blocks)
ax.legend(fontsize=8)
ax.grid(alpha=0.25, linewidth=0.5)
save(fig, "adaptive")

# E3: robustness, share flagged per strategy.
tasks = ["Second op.", "Stroop", "Switching", "Symbol-digit", "Matrices", "Corsi", "N-back"]
genuine = [1, 0, 2, 0, 1, 0, 2]
random_ = [81, 98, 98, 91, 100, 100, 82]
fig, ax = plt.subplots(figsize=(3.1, 2.4))
y = np.arange(len(tasks))
ax.barh(y + 0.19, random_, 0.36, color=ORANGE, label="Random answers")
ax.barh(y - 0.19, genuine, 0.36, color=BLUE, label="Genuine play (false alarms)")
ax.set_yticks(y, tasks, fontsize=7.5)
ax.set_xlabel("Games flagged as unreliable (%)")
ax.set_xlim(0, 105)
ax.legend(fontsize=7, loc="upper center", bbox_to_anchor=(0.5, -0.22), ncol=2)
ax.invert_yaxis()
save(fig, "robustness")

# E4: drift sweep.
q = [0.005, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06]
cov = [85, 85, 90, 96, 96, 98, 98]
gain = [3, 3, 4, 5, 6, 7, 7]
fig, ax = plt.subplots(figsize=(3.1, 2.4))
ax.plot(q, cov, "o-", color=BLUE, markersize=4, label="Final 90% coverage")
ax.axhline(90, color=ORANGE, linestyle="--", linewidth=1)
ax.axvline(0.02, color=GREY, linestyle=":", linewidth=1)
ax.annotate("chosen q = 0.02", (0.02, 86), xytext=(0.027, 86.5), fontsize=7.5, color=INK, arrowprops={"arrowstyle": "->", "color": GREY, "lw": 0.6})
ax.set_xlabel("Drift q (SD per day)")
ax.set_ylabel("Coverage (%)")
ax.set_ylim(83, 100)
ax2 = ax.twinx()
ax2.plot(q, gain, "s--", color=GREY, markersize=3, linewidth=1, label="Estimated gain")
ax2.set_ylabel("Est. gain (of 12 true)", color=GREY)
ax2.spines["right"].set_visible(True)
ax2.tick_params(axis="y", colors=GREY)
save(fig, "drift")

# E6: fairness, bias with raw vs proportional scoring for a slower, equally accurate person.
fig, ax = plt.subplots(figsize=(3.1, 2.4))
groups = ["Reference", "Laggy device\n(+80 ms)", "Slower style\n(RT ×1.3)"]
att = [-1, 2, -1]
flex = [1, 4, 1]
speed = [1, -2, -12]
xg = np.arange(3)
ax.bar(xg - 0.25, att, 0.24, color=BLUE, label="Attention")
ax.bar(xg, flex, 0.24, color=LIGHT, edgecolor=GREY, linewidth=0.5, label="Flexibility")
ax.bar(xg + 0.25, speed, 0.24, color=ORANGE, label="Processing speed")
ax.axhline(0, color=INK, linewidth=0.6)
ax.set_xticks(xg, groups, fontsize=7.5)
ax.set_ylabel("Bias: estimate − truth (points)")
ax.legend(fontsize=7, loc="lower left")
save(fig, "fairness")

# E7: blind strategies vs calibrated players in the Second-opinion game.
strat = ["Always\nfollow AI", "Always\nkeep own", "Calibrated\naverage", "Calibrated\nhigh skill"]
ar = [0.507, 0.492, 0.667, 0.787]
fig, ax = plt.subplots(figsize=(3.1, 2.4))
ax.bar(range(4), ar, color=[GREY, GREY, BLUE, BLUE], width=0.6)
ax.axhline(0.5, color=ORANGE, linestyle="--", linewidth=1)
ax.text(3.35, 0.51, "chance", color=ORANGE, fontsize=7.5, ha="right")
ax.set_xticks(range(4), strat, fontsize=7.5)
ax.set_ylim(0.4, 0.85)
ax.set_ylabel("Appropriate reliance")
save(fig, "reliance")

# E7: how many games the AI-reliance estimate needs.
k = [1, 3, 6, 10]
rk = [0.34, 0.58, 0.764, 0.807]
cv = [93, 92, 93, 90]
fig, ax = plt.subplots(figsize=(3.1, 2.4))
ax.plot(k, rk, "o-", color=BLUE, markersize=4)
ax.set_xlabel("Games of Second opinion")
ax.set_ylabel("Recovery r", color=BLUE)
ax.set_ylim(0.2, 0.9)
ax.set_xticks(k)
ax2 = ax.twinx()
ax2.plot(k, cv, "s--", color=ORANGE, markersize=3, linewidth=1)
ax2.set_ylabel("90% coverage (%)", color=ORANGE)
ax2.set_ylim(80, 100)
ax2.spines["right"].set_visible(True)
save(fig, "reliance_k")

# The Bayesian update illustrated: belief narrows with games and widens across a gap.
rng = np.random.default_rng(7)
truth = 0.62
mu, var = 0.5, 0.2**2
obs_sd = 0.2
t, means, lo, hi = [0], [mu], [mu - 1.645 * 0.2], [mu + 1.645 * 0.2]
day = 0
for g in range(10):
    day += 1 if g != 5 else 6  # a six-day gap before game 6
    var += 0.02**2 * (1 if g != 5 else 6)
    t.append(day - 0.001)
    means.append(mu)
    lo.append(mu - 1.645 * np.sqrt(var))
    hi.append(mu + 1.645 * np.sqrt(var))
    x_obs = truth + rng.normal(0, obs_sd)
    prec = 1 / var + 1 / obs_sd**2
    mu = (mu / var + x_obs / obs_sd**2) / prec
    var = 1 / prec
    t.append(day)
    means.append(mu)
    lo.append(mu - 1.645 * np.sqrt(var))
    hi.append(mu + 1.645 * np.sqrt(var))
fig, ax = plt.subplots(figsize=(6.3, 2.2))
ax.fill_between(t, np.array(lo) * 100, np.array(hi) * 100, color=BLUE, alpha=0.15, linewidth=0, label="90% band")
ax.plot(t, np.array(means) * 100, color=BLUE, linewidth=1.6, label="Estimate")
ax.axhline(truth * 100, color=ORANGE, linestyle="--", linewidth=1, label="True ability (simulated)")
ax.axvspan(6, 11, color=GREY, alpha=0.08)
ax.text(8.5, 18, "6-day gap: band widens", ha="center", fontsize=7.5, color=INK)
ax.set_xlabel("Day")
ax.set_ylabel("Score (0–100)")
ax.set_ylim(10, 100)
ax.legend(loc="upper right", ncol=3, fontsize=7.5)
save(fig, "twin_update")

print("figures written to", OUT)
