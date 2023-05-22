describe('ServiceNominatim', () => {
  let nominatim;

  before(() => {
    fetchMock.resetHistory();
  });

  beforeEach(() => {
    nominatim = new Rapid.ServiceNominatim();
    nominatim.init();
  });

  afterEach(() => {
    fetchMock.resetHistory();
  });

  function parseQueryString(url) {
    return sdk.utilStringQs(url.substring(url.indexOf('?')));
  }


  describe('#countryCode', () => {
    it('calls the given callback with the results of the country code query', (done) => {
      const callback = sinon.spy();
      fetchMock.mock(new RegExp('https://nominatim.openstreetmap.org/reverse'), {
        body: '{"address":{"country_code":"at"}}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      nominatim.countryCode([16, 48], callback);

      window.setTimeout(() => {
        expect(parseQueryString(fetchMock.calls()[0][0])).to.eql(
          { zoom: '13', format: 'json', addressdetails: '1', lat: '48', lon: '16' }
        );
        expect(callback).to.have.been.calledWithExactly(null, 'at');
        done();
      }, 50);
    });
  });


  describe('#reverse', () => {
    it('should not cache distant result', (done) => {
      let callback = sinon.spy();
      fetchMock.mock(new RegExp('https://nominatim.openstreetmap.org/reverse'), {
        body: '{"address":{"country_code":"at"}}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      nominatim.reverse([16, 48], callback);

      window.setTimeout(() => {
        expect(parseQueryString(fetchMock.calls()[0][0])).to.eql(
          { zoom: '13', format: 'json', addressdetails: '1', lat: '48', lon: '16' }
        );
        expect(callback).to.have.been.calledWithExactly(null, { address: { country_code:'at' }});

        fetchMock.resetHistory();
        fetchMock.mock(new RegExp('https://nominatim.openstreetmap.org/reverse'), {
          body: '{"address":{"country_code":"cz"}}',
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });

        callback = sinon.spy();
        nominatim.reverse([17, 49], callback);

        window.setTimeout(() => {
          expect(parseQueryString(fetchMock.calls()[0][0])).to.eql(
            { zoom: '13', format: 'json', addressdetails: '1', lat: '49', lon: '17' }
          );
          expect(callback).to.have.been.calledWithExactly(null, { address: { country_code:'cz' }});
          done();
        }, 50);
      }, 50);
    });

    it('should cache nearby result', (done) => {
      let callback = sinon.spy();
      fetchMock.mock(new RegExp('https://nominatim.openstreetmap.org/reverse'), {
        body: '{"address":{"country_code":"at"}}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      nominatim.reverse([16, 48], callback);

      window.setTimeout(() => {
        expect(parseQueryString(fetchMock.calls()[0][0])).to.eql(
          { zoom: '13', format: 'json', addressdetails: '1', lat: '48', lon: '16' }
        );
        expect(callback).to.have.been.calledWithExactly(null, { address: { country_code:'at' }});

        fetchMock.resetHistory();

        callback = sinon.spy();
        nominatim.reverse([16.000001, 48.000001], callback);

        window.setTimeout(() => {
          expect(callback).to.have.been.calledWithExactly(null, { address: { country_code:'at' }});
          done();
        }, 50);
      }, 50);
    });


    it('calls the given callback with an error', (done) => {
      const callback = sinon.spy();
      fetchMock.mock(new RegExp('https://nominatim.openstreetmap.org/reverse'), {
        body: '{"error":"Unable to geocode"}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      nominatim.reverse([1000, 1000], callback);

      window.setTimeout(() => {
        expect(parseQueryString(fetchMock.calls()[0][0])).to.eql(
          { zoom: '13', format: 'json', addressdetails: '1', lat: '1000', lon: '1000' }
        );
        expect(callback).to.have.been.calledWithExactly('Unable to geocode');
        done();
      }, 50);
    });
  });


  describe('#search', () => {
    it('calls the given callback with the results of the search query', (done) => {
      const callback = sinon.spy();
      fetchMock.mock(new RegExp('https://nominatim.openstreetmap.org/search'), {
        body: '[{"place_id":"158484588","osm_type":"relation","osm_id":"188022","boundingbox":["39.867005","40.1379593","-75.2802976","-74.9558313"],"lat":"39.9523993","lon":"-75.1635898","display_name":"Philadelphia, Philadelphia County, Pennsylvania, United States of America","class":"place","type":"city","importance":0.83238050437778}]',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      nominatim.search('philadelphia', callback);

      window.setTimeout(() => {
        expect(parseQueryString(fetchMock.calls()[0][0])).to.eql({ format: 'json', limit: '10' });
        expect(callback).to.have.been.calledOnce;
        done();
      }, 50);
    });
  });

});
