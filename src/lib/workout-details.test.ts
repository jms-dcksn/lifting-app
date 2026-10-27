import { describe,it,expect } from "vitest";
import { normalizeWorkoutText,supportsSetup,WORKOUT_TEXT_LIMIT } from "./workout-details";
import { EXERCISE_BY_ID } from "./strength/coefficients";

describe("workout personal text",()=>{
  it("keeps plain text and refuses excess text without truncating",()=>{
    expect(normalizeWorkoutText("  <script>plain text</script>\nSeat 4  ")).toBe("<script>plain text</script>\nSeat 4");
    expect(normalizeWorkoutText(" \n ")).toBeNull();
    expect(normalizeWorkoutText("😀".repeat(WORKOUT_TEXT_LIMIT))).toHaveLength(WORKOUT_TEXT_LIMIT*2);
    expect(()=>normalizeWorkoutText("😀".repeat(WORKOUT_TEXT_LIMIT+1))).toThrow("2,000");
  });
  it("uses canonical equipment and station metadata, including custom and assisted exercises",()=>{
    expect(supportsSetup({...EXERCISE_BY_ID["db-bench"],name:"Machine or Cable press"},EXERCISE_BY_ID)).toBe(false);
    expect(supportsSetup({...EXERCISE_BY_ID["db-bench"],id:"custom",equipment:"machine"},EXERCISE_BY_ID)).toBe(true);
    expect(supportsSetup({...EXERCISE_BY_ID["lat-pulldown"],id:"cable-station",stationProfile:undefined,baseExerciseId:"lat-pulldown"},EXERCISE_BY_ID)).toBe(true);
    expect(supportsSetup({...EXERCISE_BY_ID["assisted-pullup"],id:"assisted-station",stationProfile:undefined,baseExerciseId:"assisted-pullup"},EXERCISE_BY_ID)).toBe(true);
    expect(supportsSetup(EXERCISE_BY_ID["lat-pulldown"],EXERCISE_BY_ID)).toBe(false);
  });
});
