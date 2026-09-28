import test from "node:test";
import assert from "node:assert/strict";
import { extractOfficialAbilities } from "../src/card-db/parse-official-details.js";

function link(elements){
  for(let index=0;index<elements.length-1;index++)elements[index].nextElementSibling=elements[index+1];
  return elements;
}
const node=(tagName,textContent)=>({tagName,textContent});

test("official card extraction retains every printed Ability and excludes them from attack headings",()=>{
  const headings=link([
    node("H4","ワザA"),node("H4","特性"),node("P","とくせいA"),node("P","自分の番に1回使える。"),
    node("H4","ワザB"),node("H4","特性"),node("P","とくせいB"),node("P","このポケモンは効果を受けない。"),
    node("H2","弱点")
  ]);
  assert.deepEqual(extractOfficialAbilities(headings),[
    {name:"とくせいA",effect:"自分の番に1回使える。"},
    {name:"とくせいB",effect:"このポケモンは効果を受けない。"}
  ]);
  assert.equal(headings.filter(heading=>heading.tagName==="H4"&&heading.textContent.trim()!=="特性").length,2);
});

test("an incomplete official Ability block is retained for review instead of silently dropped",()=>{
  const headings=link([node("H4","特性"),node("P","未完の特性"),node("H2","弱点")]);
  assert.deepEqual(extractOfficialAbilities(headings),[{name:"未完の特性",effect:""}]);
});
