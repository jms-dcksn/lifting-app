document.querySelectorAll("[data-quiz]").forEach((quiz) => {
  const answer = quiz.dataset.answer;
  const why = quiz.querySelector(".why");
  quiz.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      if (quiz.dataset.locked === "true") return;
      quiz.dataset.locked = "true";
      const correct = button.dataset.choice === answer;
      button.classList.add(correct ? "is-right" : "is-wrong");
      if (!correct) {
        const right = quiz.querySelector(`[data-choice="${answer}"]`);
        if (right) right.classList.add("is-right");
      }
      if (why) why.hidden = false;
    });
  });
});

document.querySelectorAll("[data-recall]").forEach((box) => {
  const form = box.querySelector("form");
  const input = box.querySelector("input");
  const why = box.querySelector(".why");
  const accepted = (box.dataset.accept || "").split("|").map((item) => item.trim().toLowerCase());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (box.dataset.locked === "true") return;
    box.dataset.locked = "true";
    const value = input.value.trim().toLowerCase();
    const correct = accepted.includes(value);
    box.classList.add(correct ? "is-right" : "is-wrong");
    input.readOnly = true;
    if (why) why.hidden = false;
  });
});
