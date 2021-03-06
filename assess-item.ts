import DOMPurify from 'dompurify';
import {html, render} from 'lit-html';
import {unsafeHTML} from 'lit-html/directives/unsafe-html.js';
import {TemplateResult} from 'lit-html';
import {
    Question,
    BuiltQuestion,
    UserInput,
    UserVariable,
    UserCheck,
    UserRadio,
    UserEssay,
    UserImage,
    UserGraph,
    UserCode,
    State
} from './index.d';
import {
    buildQuestion,
    checkAnswer,
    getUserASTObjectsFromAnswerAssignment
} from './services/question-service';
import {
    getAstObjects,
    compileToHTML
} from 'assessml/assessml.ts';
import {
    AST,
    Variable,
    Input,
    Essay,
    Radio,
    Check,
    Drag,
    Drop,
    Image,
    Code,
    Graph
} from 'assessml';
import '@kuscamara/code-sample';
// import 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.8.3/katex.min.js';
import { Store } from './state/store';
import './juicy-ace-editor';

class AssessItem extends HTMLElement {
    componentId: string; //TODO figure out how to get rid of this mutation

    //TODO all of this should be done through Redux
    userInputs: UserInput[] = [];
    userEssays: UserEssay[] = [];
    userCodes: UserCode[] = [];
    userChecks: UserCheck[] = [];
    userRadios: UserRadio[] = [];

    get previousBuiltQuestion(): any {
        const componentState = Store.getState().components[this.componentId];
        return componentState ? componentState.previousBuiltQuestion : null;
    }

    get builtQuestion(): any {
        const componentState = Store.getState().components[this.componentId];
        return componentState ? componentState.builtQuestion : null;
    }

    get previousQuestion() {
        const componentState = Store.getState().components[this.componentId];
        return componentState ? componentState.previousQuestion : null;
    }

    get question(): Question | null {
        const componentState = Store.getState().components[this.componentId];
        return componentState ? componentState.question : null;
    }

    get showingSolution(): boolean {
        const componentState = Store.getState().components[this.componentId];
        return componentState ? componentState.showingSolution : false;
    }

    get showingExercise(): boolean {
        const componentState = Store.getState().components[this.componentId];
        return componentState ? componentState.showingExercise : false;
    }

    set question(question: Question | null) {
        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'previousQuestion',
            value: this.question
        });

        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'question',
            value: question
        });

        if (
            question === null ||
            question === undefined ||
            (
                this.previousQuestion && 
                question.assessML === this.previousQuestion.assessML &&
                question.javaScript === this.previousQuestion.javaScript
            )
        ) {
            return;
        }

        this.buildQuestion(question);
    }

    constructor() {
        super();

        this.componentId = createUUID();
        Store.subscribe(() => render(this.render(Store.getState(), this.componentId), this));
    }

    connectedCallback() {
        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'question',
            value: null
        });

        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'solutionButtonText',
            value: 'Solution'
        });

        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'showingExercise',
            value: true
        });

        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'showingSolution',
            value: false
        });

        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'showEmbedCode',
            value: false
        });

        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'checkAnswerResponse',
            value: ''
        });
    }

    async buildQuestion(question: Question) {
        const componentState = Store.getState().components[this.componentId];

        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'previousBuiltQuestion',
            value: this.builtQuestion
        });

        const builtQuestion = await buildQuestion(question.assessML, question.javaScript);
        const showSolution = builtQuestion ? getAstObjects(builtQuestion.ast, 'SOLUTION').length > 0 : false;
        const userRadiosFromCode = getUserASTObjectsFromAnswerAssignment(question.assessML, question.javaScript, 'RADIO');
        const userChecksFromCode = getUserASTObjectsFromAnswerAssignment(question.assessML, question.javaScript, 'CHECK');
        const userInputsFromCode = getUserASTObjectsFromAnswerAssignment(question.assessML, question.javaScript, 'INPUT');

        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'builtQuestion',
            value: builtQuestion
        });

        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'showingExercise',
            value: true
        });

        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'showingSolution',
            value: false
        });

        this.dispatchEvent(new CustomEvent('question-built'));

        if (!this.previousBuiltQuestion) {
            this.dispatchEvent(new CustomEvent('question-changed'));
        }

        if (
            this.previousBuiltQuestion &&
            builtQuestion.html !== this.previousBuiltQuestion.html
        ) {
            this.dispatchEvent(new CustomEvent('question-changed'));
        }

        //TODO this causes issues with the secureEval messaging, probably won't be hard to fix (I think it is fixed, just need to try again)
        //this is so that if the question is being viewed from within an iframe, the iframe can resize itself
        // window.parent.postMessage({
        //     type: 'prendus-view-question-resize',
        //     height: document.body.scrollHeight,
        //     width: document.body.scrollWidth
        // }, '*');
    }

    getSanitizedHTML(html: string) {
        //TODO we might not need DOMPurify with lit-html, look into it
        const sanitizedHTML = DOMPurify.sanitize(html, {
            ADD_ATTR: ['contenteditable', 'fontsize', 'data', 'copy-clipboard-button', 'target', 'render'],
            ADD_TAGS: ['juicy-ace-editor', 'function-plot', 'code-sample'],
            SANITIZE_DOM: false // This allows DOMPurify.sanitize to be called multiple times in succession without changing the output (it was removing ids before)
        });
        return sanitizedHTML;
    }

    //TODO when we show the solution, we need to save the state of all of the user inputs, then put them back when the user is done seeing the solution
    //TODO perhaps we should keep all of the state of the user inputs in Redux...we'll need to attach listeners somehow
    //TODO we should probably just attach listeners imperatively when building the question...yes

    showExercise() {
        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'showingExercise',
            value: true
        });

        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'showingSolution',
            value: false
        });

        const componentState = Store.getState().components[this.componentId];

        const builtQuestion = {
            ...componentState.builtQuestion,
            html: compileToHTML(componentState.builtQuestion.ast, () => NaN, () => '')
        };

        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'builtQuestion',
            value: builtQuestion
        });

        //TODO it would be nice to do this declaratively
        this.userInputs.forEach((userInput: UserInput) => {
            this.querySelector(`#${userInput.varName}`).textContent = userInput.value;
        });

        this.userEssays.forEach((userEssay: UserEssay) => {
            this.querySelector(`#${userEssay.varName}`).value = userEssay.value;
        });

        this.userCodes.forEach((userCode: UserCode) => {
            this.querySelector(`#${userCode.varName}`).value = userCode.value;
        });

        this.userChecks.forEach((userCheck: UserCheck) => {
            this.querySelector(`#${userCheck.varName}`).checked = userCheck.checked;
        });

        this.userRadios.forEach((userRadio: UserRadio) => {
            this.querySelector(`#${userRadio.varName}`).checked = userRadio.checked;
        });

        this.dispatchEvent(new CustomEvent('question-built'));
    }

    showSolution() {
        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'showingSolution',
            value: true
        });

        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'showingExercise',
            value: false
        });

        const componentState = Store.getState().components[this.componentId];

        const builtQuestion = componentState.builtQuestion;

        //TODO it would be nice to do this declaratively
        //TODO this code is repeated from checkAnswer
        const astInputs: Input[] = getAstObjects(builtQuestion.ast, 'INPUT', ['SOLUTION']);
        const astEssays: Essay[] = getAstObjects(builtQuestion.ast, 'ESSAY', ['SOLUTION']);
        const astCodes: Code[] = getAstObjects(builtQuestion.ast, 'CODE', ['SOLUTION']);
        const astChecks: Check[] = getAstObjects(builtQuestion.ast, 'CHECK', ['SOLUTION']);
        const astRadios: Radio[] = getAstObjects(builtQuestion.ast, 'RADIO', ['SOLUTION']);

        this.userInputs = astInputs.map((astInput: Input) => {
            const input: HTMLInputElement | null = <HTMLInputElement | null> this.querySelector(`#${astInput.varName}`);
            const userInput: UserInput = {
                ...astInput,
                type: 'USER_INPUT',
                value: input ? input.textContent || '' : `${astInput.varName} was not found`
            };
            return userInput;
        });

        this.userEssays = astEssays.map((astEssay: Essay) => {
            const textarea: HTMLTextAreaElement | null = <HTMLTextAreaElement | null> this.querySelector(`#${astEssay.varName}`);
            const userEssay: UserEssay = {
                ...astEssay,
                type: 'USER_ESSAY',
                value: textarea ? textarea.value : `${astEssay.varName} was not found`
            };
            return userEssay;
        });

        this.userCodes = astCodes.map((astCode: Code) => {
            //TODO the type here should be the type of the code editor custom element, and change the variable name as well
            const textarea: HTMLTextAreaElement | null = <HTMLTextAreaElement | null> this.querySelector(`#${astCode.varName}`);
            const userCode: UserCode = {
                ...astCode,
                type: 'USER_CODE',
                value: textarea ? textarea.value : `${astCode.varName} was not found`
            };
            return userCode;
        });

        this.userChecks = astChecks.map((astCheck: Check) => {
            const check: HTMLInputElement | null = <HTMLInputElement | null> this.querySelector(`#${astCheck.varName}`);
            const userCheck: UserCheck = {
                ...astCheck,
                type: 'USER_CHECK',
                checked: check ? check.checked : false
            };
            return userCheck;
        });

        this.userRadios = astRadios.map((astRadio: Radio) => {
            const radio: HTMLInputElement | null = <HTMLInputElement | null> this.querySelector(`#${astRadio.varName}`);
            const userRadio: UserRadio = {
                ...astRadio,
                type: 'USER_RADIO',
                checked: radio ? radio.checked : false
            };
            return userRadio;
        });

        const solutionTemplate = <HTMLTemplateElement> this.querySelector('#solution1');

        const newBuiltQuestion = {
            ...componentState.builtQuestion,
            html: solutionTemplate.innerHTML
        };

        Store.dispatch({
            type: 'SET_COMPONENT_PROPERTY',
            componentId: this.componentId,
            key: 'builtQuestion',
            value: newBuiltQuestion
        });

        this.dispatchEvent(new CustomEvent('question-built'));
    }

    async checkAnswer() {
        const componentState = Store.getState().components[this.componentId];
        const question = componentState.question;
        const builtQuestion = componentState.builtQuestion;

        const astVariables: Variable[] = getAstObjects(builtQuestion.ast, 'VARIABLE', ['SOLUTION']);
        const astInputs: Input[] = getAstObjects(builtQuestion.ast, 'INPUT', ['SOLUTION']);
        const astEssays: Essay[] = getAstObjects(builtQuestion.ast, 'ESSAY', ['SOLUTION']);
        const astCodes: Code[] = getAstObjects(builtQuestion.ast, 'CODE', ['SOLUTION']);
        const astChecks: Check[] = getAstObjects(builtQuestion.ast, 'CHECK', ['SOLUTION']);
        const astRadios: Radio[] = getAstObjects(builtQuestion.ast, 'RADIO', ['SOLUTION']);
        const astDrags: Drag[] = getAstObjects(builtQuestion.ast, 'DRAG', ['SOLUTION']);
        const astDrops: Drop[] = getAstObjects(builtQuestion.ast, 'DROP', ['SOLUTION']);
        const astImages: Image[] = getAstObjects(builtQuestion.ast, 'IMAGE', ['SOLUTION']);
        const astGraphs: Graph[] = getAstObjects(builtQuestion.ast, 'GRAPH', ['SOLUTION']);

        const userVariables: UserVariable[] = astVariables.map((astVariable: Variable) => {
            const userVariable: UserVariable = {
                ...astVariable,
                type: 'USER_VARIABLE'
            };
            return userVariable;
        });
        const userImages: UserImage[] = astImages.map((astImage: Image) => {
            const userImage: UserImage = {
                ...astImage,
                type: 'USER_IMAGE'
            };
            return userImage;
        });
        const userGraphs: UserGraph[] = astGraphs.map((astGraph: Graph) => {
            const userGraph: UserGraph = {
                ...astGraph,
                type: 'USER_GRAPH'
            };
            return userGraph;
        });
        const userInputs: UserInput[] = astInputs.map((astInput: Input) => {
            const input: HTMLInputElement | null = <HTMLInputElement | null> this.querySelector(`#${astInput.varName}`);
            const userInput: UserInput = {
                ...astInput,
                type: 'USER_INPUT',
                value: input ? input.textContent || '' : `${astInput.varName} was not found`
            };
            return userInput;
        });
        const userEssays: UserEssay[] = astEssays.map((astEssay: Essay) => {
            const textarea: HTMLTextAreaElement | null = <HTMLTextAreaElement | null> this.querySelector(`#${astEssay.varName}`);
            const userEssay: UserEssay = {
                ...astEssay,
                type: 'USER_ESSAY',
                value: textarea ? textarea.value : `${astEssay.varName} was not found`
            };
            return userEssay;
        });
        const userCodes: UserCode[] = astCodes.map((astCode: Code) => {
            //TODO the type here should be the type of the code editor custom element, and change the variable name as well
            const textarea: HTMLTextAreaElement | null = <HTMLTextAreaElement | null> this.querySelector(`#${astCode.varName}`);
            const userCode: UserCode = {
                ...astCode,
                type: 'USER_CODE',
                value: textarea ? textarea.value : `${astCode.varName} was not found`
            };
            return userCode;
        });
        const userChecks: UserCheck[] = astChecks.map((astCheck: Check) => {
            const check: HTMLInputElement | null = <HTMLInputElement | null> this.querySelector(`#${astCheck.varName}`);
            const userCheck: UserCheck = {
                ...astCheck,
                type: 'USER_CHECK',
                checked: check ? check.checked : false
            };
            return userCheck;
        });
        const userRadios: UserRadio[] = astRadios.map((astRadio: Radio) => {
            const radio: HTMLInputElement | null = <HTMLInputElement | null> this.querySelector(`#${astRadio.varName}`);
            const userRadio: UserRadio = {
                ...astRadio,
                type: 'USER_RADIO',
                checked: radio ? radio.checked : false
            };
            return userRadio;
        });

        const checkAnswerInfo = await checkAnswer(question.javaScript, builtQuestion.originalVariableValues, userVariables, userInputs, userEssays, userCodes, userChecks, userRadios, userImages, userGraphs);
        const checkAnswerResponse = checkAnswerInfo.answer === true ? 'Correct' : checkAnswerInfo.error ? `This question has errors:\n\n${checkAnswerInfo.error}` : 'Incorrect';

        this.dispatchEvent(new CustomEvent('question-response', {
            detail: {
                userVariables,
                userInputs,
                userEssays,
                userChecks,
                userRadios,
                userCodes,
                checkAnswerResponse
            }
        }));
    }

    render(state: State, componentId: string): TemplateResult {
        const componentState = state.components[this.componentId];

        if (componentState === null || componentState === undefined) {
            return html`No question set`;
        }

        const mathRenderedHTML = this.getSanitizedHTML(componentState.builtQuestion ? componentState.builtQuestion.html : '').replace(/\$\$.*\$\$/g, (replacement: string) => {
            return window.katex.renderToString(replacement.replace(/\$/g, ''));
        });

        return html`
            <style>
                .mainContainer {
                    position: relative;
                }

                .questionPreviewPlaceholder {
                    color: rgba(1, 1, 1, .25);
                    text-align: center;
                }

                .questionSolutionButton {
                    cursor: pointer;
                    margin-right: 5vw;
                    margin-left: auto;
                }
            </style>

            <div class="mainContainer" ?hidden=${!componentState.builtQuestion}>
                <div id="contentDiv">
                    ${unsafeHTML(mathRenderedHTML)}
                </div>
            </div>

            <div class="questionPreviewPlaceholder" ?hidden=${componentState.builtQuestion}>
                Question preview will appear here
            </div>
        `;
    }
}

window.customElements.define('assess-item', AssessItem);

// async showEmbedCodeClick() {
//     await execute(`
//         mutation setShowEmbedCode($componentId: String!, $props: Any) {
//             updateComponentState(componentId: $componentId, props: $props)
//         }
//     `, {
//         setShowEmbedCode: (previousResult) => {
//             return {
//                 componentId: this.componentId,
//                 props: {
//                     showEmbedCode: !this.showEmbedCode
//                 }
//             };
//         }
//     }, this.userToken);
//
//     //allow the template with the input to be stamped
//     setTimeout(() => {
//         this.querySelector('#embedInput').select();
//     }, 0);
// }

function createUUID() {
    //From persistence.js; Copyright (c) 2010 Zef Hemel <zef@zef.me> * * Permission is hereby granted, free of charge, to any person * obtaining a copy of this software and associated documentation * files (the "Software"), to deal in the Software without * restriction, including without limitation the rights to use, * copy, modify, merge, publish, distribute, sublicense, and/or sell * copies of the Software, and to permit persons to whom the * Software is furnished to do so, subject to the following * conditions: * * The above copyright notice and this permission notice shall be * included in all copies or substantial portions of the Software. * * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR * OTHER DEALINGS IN THE SOFTWARE.
	var s: any[] = [];
	var hexDigits = "0123456789ABCDEF";
	for ( var i = 0; i < 32; i++) {
		s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
	}
	s[12] = "4";
	s[16] = hexDigits.substr((s[16] & 0x3) | 0x8, 1);

	var uuid = s.join("");
	return uuid;
}