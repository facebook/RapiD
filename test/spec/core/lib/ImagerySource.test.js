describe('ImagerySource', () => {

  class MockLocalizationSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    t()           { return ''; }
    tHtml()       { return ''; }
  }

  class MockContext {
    constructor()  {
      this.systems = {
        l10n:  new MockLocalizationSystem(this)
      };
    }
  }

  const context = new MockContext();


  it('does not error with blank template', () => {
    const source = new Rapid.ImagerySource(context, { template: '', id:'anyid' });
    expect(source.url([0,1,2])).to.equal('');
  });

  it('supports tms replacement tokens', () => {
    const source = new Rapid.ImagerySource(context, {
      id: 'anyid',
      type: 'tms',
      template: '{z}/{x}/{y}'
    });
    expect(source.url([0,1,2])).to.equal('2/0/1');
  });

  it('supports wms replacement tokens', () => {
    const source = new Rapid.ImagerySource(context, {
      id:'anyid',
      type: 'wms',
      projection: 'EPSG:3857',
      template: 'SRS={proj}&imageSR={wkid}&bboxSR={wkid}&FORMAT=image/jpeg&WIDTH={width}&HEIGHT={height}&BBOX={bbox}'
    });

    const result = sdk.utilStringQs(source.url([0,1,2]));
    expect(result.SRS).to.equal('EPSG:3857');
    expect(result.imageSR).to.equal('3857');
    expect(result.bboxSR).to.equal('3857');
    expect(result.FORMAT).to.equal('image/jpeg');
    expect(result.WIDTH).to.equal('256');
    expect(result.HEIGHT).to.equal('256');

    const bbox = result.BBOX.split(',');
    expect(+bbox[0]).to.be.closeTo(-20037508.34, 1e-3);
    expect(+bbox[1]).to.be.closeTo(0, 1e-3);
    expect(+bbox[2]).to.be.closeTo(-10018754.17, 1e-3);
    expect(+bbox[3]).to.be.closeTo(10018754.17, 1e-3);
  });

  it('supports subdomains', () => {
    const source = new Rapid.ImagerySource(context, { id:'anyid', template: '{switch:a,b}/{z}/{x}/{y}'});
    expect(source.url([0,1,2])).to.equal('b/2/0/1');
  });

  it('distributes requests between subdomains', () => {
    const source = new Rapid.ImagerySource(context, { id:'anyid', template: '{switch:a,b}/{z}/{x}/{y}' });
    expect(source.url([0,1,1])).to.equal('b/1/0/1');
    expect(source.url([0,2,1])).to.equal('a/1/0/2');
  });

  it('correctly displays an overlay with no overzoom specified', () => {
    const source = new Rapid.ImagerySource(context, { id:'anyid', zoomExtent: [6,16] });
    expect(source.validZoom(10)).to.be.true;
    expect(source.validZoom(3)).to.be.false;
    expect(source.validZoom(17)).to.be.true;
  });

  it('correctly displays an overlay with an invalid overzoom', () => {
    const source = new Rapid.ImagerySource(context, { id:'anyid', zoomExtent: [6,16], overzoom: 'gibberish'});
    expect(source.validZoom(10)).to.be.true;
    expect(source.validZoom(3)).to.be.false;
    expect(source.validZoom(17)).to.be.true;
  });

  it('correctly displays an overlay with overzoom:true', () => {
    const source = new Rapid.ImagerySource(context, { id:'anyid', zoomExtent: [6,16], overzoom: true});
    expect(source.validZoom(10)).to.be.true;
    expect(source.validZoom(3)).to.be.false;
    expect(source.validZoom(17)).to.be.true;
  });

  it('correctly displays an overlay with overzoom:false', () => {
    const source = new Rapid.ImagerySource(context, { id:'anyid', zoomExtent: [6,16], overzoom: false});
    expect(source.validZoom(10)).to.be.true;
    expect(source.validZoom(3)).to.be.false;
    expect(source.validZoom(17)).to.be.false;
  });
});

describe('ImagerySourceCustom', () => {
  describe('imageryUsed', () => {
    it('returns an imagery_used string', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com');
      expect(source.imageryUsed).to.eql('Custom (http://example.com )');  // note ' )' space
    });
    it('sanitizes `access_token`', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com?access_token=MYTOKEN');
      expect(source.imageryUsed).to.eql('Custom (http://example.com?access_token={apikey} )');
    });
    it('sanitizes `connectId`', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com?connectId=MYTOKEN');
      expect(source.imageryUsed).to.eql('Custom (http://example.com?connectId={apikey} )');
    });
    it('sanitizes `token`', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com?token=MYTOKEN');
      expect(source.imageryUsed).to.eql('Custom (http://example.com?token={apikey} )');
    });
    it('sanitizes wms path `token`', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com/wms/v1/token/MYTOKEN/1.0.0/layer');
      expect(source.imageryUsed).to.eql('Custom (http://example.com/wms/v1/token/{apikey}/1.0.0/layer )');
    });
    it('sanitizes `key` in the URL path', function() {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com/services;key=MYTOKEN/layer');
      expect(source.imageryUsed).to.eql('Custom (http://example.com/services;key={apikey}/layer )');
    });
  });
});
