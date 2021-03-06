import {describe, xit, it, expect, beforeEach, ddescribe, iit, el} from 'angular2/test_lib';

import {DOM} from 'angular2/src/facade/dom';
import {Map, MapWrapper} from 'angular2/src/facade/collection';
import {Type, isPresent} from 'angular2/src/facade/lang';

import {Injector} from 'angular2/di';
import {Lexer, Parser, ChangeDetector, dynamicChangeDetection} from 'angular2/change_detection';

import {Compiler, CompilerCache} from 'angular2/src/core/compiler/compiler';
import {DirectiveMetadataReader} from 'angular2/src/core/compiler/directive_metadata_reader';
import {NativeShadowDomStrategy} from 'angular2/src/core/compiler/shadow_dom_strategy';
import {TemplateLoader} from 'angular2/src/core/compiler/template_loader';
import {TemplateResolver} from 'angular2/src/core/compiler/template_resolver';
import {BindingPropagationConfig} from 'angular2/src/core/compiler/binding_propagation_config';

import {Decorator, Component, Viewport} from 'angular2/src/core/annotations/annotations';
import {Template} from 'angular2/src/core/annotations/template';

import {ViewContainer} from 'angular2/src/core/compiler/view_container';

export function main() {
  describe('integration tests', function() {
    var compiler, tplResolver;

    beforeEach( () => {
      tplResolver = new FakeTemplateResolver();
      compiler = new Compiler(dynamicChangeDetection,
        new TemplateLoader(null),
        new DirectiveMetadataReader(),
        new Parser(new Lexer()),
        new CompilerCache(),
        new NativeShadowDomStrategy(),
        tplResolver
      );
    });

    describe('react to record changes', function() {
      var view, ctx, cd;
      function createView(pv) {
        ctx = new MyComp();
        view = pv.instantiate(null, null);
        view.hydrate(new Injector([]), null, ctx);
        cd = view.changeDetector;
      }

      it('should consume text node changes', (done) => {
        tplResolver.setTemplate(MyComp, new Template({inline: '<div>{{ctxProp}}</div>'}));

        compiler.compile(MyComp).then((pv) => {
          createView(pv);
          ctx.ctxProp = 'Hello World!';

          cd.detectChanges();
          expect(DOM.getInnerHTML(view.nodes[0])).toEqual('Hello World!');
          done();
        });
      });

      it('should consume element binding changes', (done) => {
        tplResolver.setTemplate(MyComp, new Template({inline: '<div [id]="ctxProp"></div>'}));

        compiler.compile(MyComp).then((pv) => {
          createView(pv);

          ctx.ctxProp = 'Hello World!';
          cd.detectChanges();

          expect(view.nodes[0].id).toEqual('Hello World!');
          done();
        });
      });

      it('should consume binding to aria-* attributes', (done) => {
        tplResolver.setTemplate(MyComp, new Template({inline: '<div [aria-label]="ctxProp"></div>'}));

        compiler.compile(MyComp).then((pv) => {
          createView(pv);

          ctx.ctxProp = 'Initial aria label';
          cd.detectChanges();
          expect(DOM.getAttribute(view.nodes[0], 'aria-label')).toEqual('Initial aria label');

          ctx.ctxProp = 'Changed aria label';
          cd.detectChanges();
          expect(DOM.getAttribute(view.nodes[0], 'aria-label')).toEqual('Changed aria label');

          done();
        });
      });

      it('should consume directive watch expression change.', (done) => {
        var tpl =
          '<div>' +
            '<div my-dir [elprop]="ctxProp"></div>' +
            '<div my-dir elprop="Hi there!"></div>' +
            '<div my-dir elprop="Hi {{\'there!\'}}"></div>' +
            '<div my-dir elprop="One more {{ctxProp}}"></div>' +
          '</div>'
        tplResolver.setTemplate(MyComp, new Template({inline: tpl, directives: [MyDir]}));

        compiler.compile(MyComp).then((pv) => {
          createView(pv);

          ctx.ctxProp = 'Hello World!';
          cd.detectChanges();

          expect(view.elementInjectors[0].get(MyDir).dirProp).toEqual('Hello World!');
          expect(view.elementInjectors[1].get(MyDir).dirProp).toEqual('Hi there!');
          expect(view.elementInjectors[2].get(MyDir).dirProp).toEqual('Hi there!');
          expect(view.elementInjectors[3].get(MyDir).dirProp).toEqual('One more Hello World!');
          done();
        });
      });

      it('should support nested components.', (done) => {
        tplResolver.setTemplate(MyComp, new Template({
          inline: '<child-cmp></child-cmp>',
          directives: [ChildComp]
        }));

        compiler.compile(MyComp).then((pv) => {
          createView(pv);

          cd.detectChanges();

          expect(view.nodes[0].shadowRoot.childNodes[0].nodeValue).toEqual('hello');
          done();
        });
      });

      // GH issue 328 - https://github.com/angular/angular/issues/328
      it('should support different directive types on a single node', (done) => {
        tplResolver.setTemplate(MyComp,
          new Template({
            inline: '<child-cmp my-dir [elprop]="ctxProp"></child-cmp>',
            directives: [MyDir, ChildComp]
          }));

        compiler.compile(MyComp).then((pv) => {
          createView(pv);

          ctx.ctxProp = 'Hello World!';
          cd.detectChanges();

          var elInj = view.elementInjectors[0];
          expect(elInj.get(MyDir).dirProp).toEqual('Hello World!');
          expect(elInj.get(ChildComp).dirProp).toEqual(null);

          done();
        });
      });

      it('should support template directives via `<template>` elements.', (done) => {
        tplResolver.setTemplate(MyComp,
          new Template({
            inline: '<div><template some-viewport var-greeting="some-tmpl"><copy-me>{{greeting}}</copy-me></template></div>',
            directives: [SomeViewport]
          }));

        compiler.compile(MyComp).then((pv) => {
          createView(pv);

          cd.detectChanges();

          var childNodesOfWrapper = view.nodes[0].childNodes;
          // 1 template + 2 copies.
          expect(childNodesOfWrapper.length).toBe(3);
          expect(childNodesOfWrapper[1].childNodes[0].nodeValue).toEqual('hello');
          expect(childNodesOfWrapper[2].childNodes[0].nodeValue).toEqual('again');
          done();
        });
      });

      it('should support template directives via `template` attribute.', (done) => {
        tplResolver.setTemplate(MyComp, new Template({
          inline: '<div><copy-me template="some-viewport: var greeting=some-tmpl">{{greeting}}</copy-me></div>',
          directives: [SomeViewport]
        }));

        compiler.compile(MyComp).then((pv) => {
          createView(pv);

          cd.detectChanges();

          var childNodesOfWrapper = view.nodes[0].childNodes;
          // 1 template + 2 copies.
          expect(childNodesOfWrapper.length).toBe(3);
          expect(childNodesOfWrapper[1].childNodes[0].nodeValue).toEqual('hello');
          expect(childNodesOfWrapper[2].childNodes[0].nodeValue).toEqual('again');
          done();
        });
      });

      it('should assign the component instance to a var-', (done) => {
        tplResolver.setTemplate(MyComp, new Template({
          inline: '<p><child-cmp var-alice></child-cmp></p>',
          directives: [ChildComp]
        }));

        compiler.compile(MyComp).then((pv) => {
          createView(pv);

          expect(view.contextWithLocals).not.toBe(null);
          expect(view.contextWithLocals.get('alice')).toBeAnInstanceOf(ChildComp);

          done();
        })
      });

      it('should assign two component instances each with a var-', (done) => {
        tplResolver.setTemplate(MyComp, new Template({
          inline: '<p><child-cmp var-alice></child-cmp><child-cmp var-bob></p>',
          directives: [ChildComp]
        }));

        compiler.compile(MyComp).then((pv) => {
          createView(pv);

          expect(view.contextWithLocals).not.toBe(null);
          expect(view.contextWithLocals.get('alice')).toBeAnInstanceOf(ChildComp);
          expect(view.contextWithLocals.get('bob')).toBeAnInstanceOf(ChildComp);
          expect(view.contextWithLocals.get('alice')).not.toBe(view.contextWithLocals.get('bob'));

          done();
        })
      });

      it('should assign the component instance to a var- with shorthand syntax', (done) => {
        tplResolver.setTemplate(MyComp, new Template({
          inline: '<child-cmp #alice></child-cmp>',
          directives: [ChildComp]
        }));

        compiler.compile(MyComp).then((pv) => {
          createView(pv);

          expect(view.contextWithLocals).not.toBe(null);
          expect(view.contextWithLocals.get('alice')).toBeAnInstanceOf(ChildComp);

          done();
        })
      });

      it('should assign the element instance to a user-defined variable', (done) => {
        tplResolver.setTemplate(MyComp,
          new Template({inline: '<p><div var-alice><i>Hello</i></div></p>'}));

        compiler.compile(MyComp).then((pv) => {
          createView(pv);
          expect(view.contextWithLocals).not.toBe(null);

          var value = view.contextWithLocals.get('alice');
          expect(value).not.toBe(null);
          expect(value.tagName).toEqual('DIV');

          done();
        })
      });

      it('should provide binding configuration config to the component', (done) => {
        tplResolver.setTemplate(MyComp, new Template({
          inline: '<push-cmp #cmp></push-cmp>',
          directives: [[[PushBasedComp]]]
        }));

        compiler.compile(MyComp).then((pv) => {
          createView(pv);

          var cmp = view.contextWithLocals.get('cmp');

          cd.detectChanges();
          expect(cmp.numberOfChecks).toEqual(1);

          cd.detectChanges();
          expect(cmp.numberOfChecks).toEqual(1);

          cmp.propagate();

          cd.detectChanges();
          expect(cmp.numberOfChecks).toEqual(2);
          done();
        })
      });
    });
  });
}

@Decorator({
  selector: '[my-dir]',
  bind: {'elprop':'dirProp'}
})
class MyDir {
  dirProp:string;
  constructor() {
    this.dirProp = '';
  }
}

@Component({selector: 'push-cmp'})
@Template({inline: '{{field}}'})
class PushBasedComp {
  numberOfChecks:number;
  bpc:BindingPropagationConfig;

  constructor(bpc:BindingPropagationConfig) {
    this.numberOfChecks = 0;
    this.bpc = bpc;
    bpc.shouldBePropagated();
  }

  get field(){
    this.numberOfChecks++;
    return "fixed";
  }

  propagate() {
    this.bpc.shouldBePropagatedFromRoot();
  }
}

@Component()
class MyComp {
  ctxProp:string;
  constructor() {
    this.ctxProp = 'initial value';
  }
}

@Component({
  selector: 'child-cmp',
  componentServices: [MyService]
})
@Template({
  directives: [MyDir],
  inline: '{{ctxProp}}'
})
class ChildComp {
  ctxProp:string;
  dirProp:string;
  constructor(service: MyService) {
    this.ctxProp = service.greeting;
    this.dirProp = null;
  }
}

@Viewport({
  selector: '[some-viewport]'
})
class SomeViewport {
  constructor(container: ViewContainer) {
    container.create().setLocal('some-tmpl', 'hello');
    container.create().setLocal('some-tmpl', 'again');
  }
}

class MyService {
  greeting:string;
  constructor() {
    this.greeting = 'hello';
  }
}

class FakeTemplateResolver extends TemplateResolver {
  _cmpTemplates: Map;

  constructor() {
    super();
    this._cmpTemplates = MapWrapper.create();
  }

  setTemplate(component: Type, template: Template) {
    MapWrapper.set(this._cmpTemplates, component, template);
  }

  resolve(component: Type): Template {
    var override = MapWrapper.get(this._cmpTemplates, component);

    if (isPresent(override)) {
      return override;
    }

    return super.resolve(component);
  }
}
