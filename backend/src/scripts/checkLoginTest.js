import axios from "axios";

const TEAMS = [
  { id: "DEX26001", email: "aswinjaenif@gmail.com", num: "01", name: "Elite.html" },
  { id: "DEX26002", email: "rishitha2006@gmail.com", num: "02", name: "Raw Matrix" },
  { id: "DEX26003", email: "dasthudasthu177@gmail.com", num: "03", name: "Neural nomad" },
  { id: "DEX26004", email: "bavadharani1901@gmail.com", num: "04", name: "Idea flux" },
  { id: "DEX26005", email: "kamaliseetharaman848@gmail.com", num: "05", name: "Team Kamali" },
  { id: "DEX26006", email: "ma2230@srmist.edu.in", num: "06", name: "AgentVerse" },
  { id: "DEX26007", email: "xsanjayofficial@gmail.com", num: "07", name: "Bug Buster" },
  { id: "DEX26008", email: "shivanimurthi@gmail.com", num: "08", name: "Nexovara" },
  { id: "DEX26009", email: "sanjay.cric07@gmail.com", num: "09", name: "HACK MATES" },
  { id: "DEX26010", email: "7504.ahamedabdullah@gmail.com", num: "10", name: "Team Ahamed Abdullah" },
];

async function run() {
  console.log("Testing Team Portal Login for all 10 retained teams with password 'Dexathon@2026'...\n");
  let passed = 0;

  for (const t of TEAMS) {
    // Test with Team ID
    try {
      const res1 = await axios.post("http://localhost:5000/api/team/login", {
        userId: t.id,
        password: "Dexathon@2026",
      });
      console.log(`✅ [PASS] By Team ID "${t.id}" -> Logged in: ${res1.data.teamId} (${res1.data.teamName})`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] By Team ID "${t.id}":`, err.response?.data || err.message);
    }

    // Test with Email
    try {
      const res2 = await axios.post("http://localhost:5000/api/team/login", {
        userId: t.email,
        password: "Dexathon@2026",
      });
      console.log(`✅ [PASS] By Email "${t.email}" -> Logged in: ${res2.data.teamId}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] By Email "${t.email}":`, err.response?.data || err.message);
    }
  }

  console.log(`\nFinal Test Results: ${passed} / ${TEAMS.length * 2} login tests PASSED!`);
}

run().catch(console.error);
